import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getAddress, type Address, type Hex } from 'viem';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildMarketSnapshot, CALCULATION_VERSION } from '../../src/analytics/math.js';
import {
  PostgresAnalyticsStore,
  SnapshotConflictError,
} from '../../src/analytics/postgres-store.js';
import {
  createMarketSnapshot,
  getCurrentState,
  getFlows,
  rebuildHourlyFlows,
} from '../../src/analytics/service.js';
import { ViemMarketStateSource } from '../../src/analytics/source.js';
import type { RawMarketState } from '../../src/analytics/types.js';
import { createDatabase } from '../../src/db/client.js';
import { decodeAndFilterMarketLogs } from '../../src/indexer/normalize.js';
import {
  BlockHashConflictError,
  PostgresIndexerStore,
  RawLogConflictError,
} from '../../src/indexer/postgres-store.js';
import { backfill } from '../../src/indexer/service.js';
import { ViemChainSource } from '../../src/indexer/source.js';
import type { ChainBlock, ChainLog } from '../../src/indexer/types.js';
import { committedMarketManifest } from '../../src/protocol/committed-manifest.js';

const shouldRun = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const shouldRunNetwork = process.env.RUN_NETWORK_INTEGRATION_TESTS === 'true';
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = shouldRun ? describe.sequential : describe.skip;

if (shouldRun && !databaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL or DATABASE_URL is required when RUN_DATABASE_INTEGRATION_TESTS=true',
  );
}

interface Fixture {
  blockNumber: string;
  blockHash: Hex;
  blockTimestamp: string;
  transactionHash: Hex;
  transactionIndex: number;
  logIndex: number;
  address: Address;
  topics: Hex[];
  data: Hex;
}

const fixturePath = fileURLToPath(
  new URL('../../fixtures/events/hyperlend-usdc-core.v1.json', import.meta.url),
);

describeWithPostgres('PostgreSQL indexer persistence', () => {
  const connection = createDatabase(databaseUrl ?? 'postgresql://unused:unused@127.0.0.1:1/unused');
  const store = new PostgresIndexerStore(connection.client);
  const analyticsStore = new PostgresAnalyticsStore(connection.client);
  let record: ReturnType<typeof decodeAndFilterMarketLogs>['records'][number];
  let records: ReturnType<typeof decodeAndFilterMarketLogs>['records'];

  beforeAll(async () => {
    await migrate(connection.database, { migrationsFolder: 'drizzle' });
    await connection.client`
      truncate table hourly_flow_aggregates, market_snapshots, ingestion_failures,
                     market_events, raw_logs, indexer_checkpoints, indexer_runs,
                     blocks restart identity cascade
    `;
    const fixtureFile = JSON.parse(await readFile(fixturePath, 'utf8')) as {
      fixtures: Fixture[];
    };
    const blocks = new Map<bigint, ChainBlock>();
    const logs: ChainLog[] = fixtureFile.fixtures.map((fixture) => {
      const block: ChainBlock = {
        number: BigInt(fixture.blockNumber),
        hash: fixture.blockHash,
        timestamp: BigInt(fixture.blockTimestamp),
      };
      blocks.set(block.number, block);
      return {
        blockNumber: block.number,
        blockHash: block.hash,
        transactionHash: fixture.transactionHash,
        transactionIndex: fixture.transactionIndex,
        logIndex: fixture.logIndex,
        address: getAddress(fixture.address),
        topics: fixture.topics,
        data: fixture.data,
      };
    });
    const decoded = decodeAndFilterMarketLogs(
      logs,
      blocks,
      getAddress(committedMarketManifest.tokens.underlying.address),
    );
    records = decoded.records;
    const prepared = records.find((candidate) => candidate.event.eventType === 'Supply');
    if (!prepared) throw new Error('Supply fixture did not decode');
    record = prepared;
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it('atomically persists raw and normalized data with exact uniqueness', async () => {
    const metadata = {
      command: 'backfill' as const,
      checkpointKey: 'postgres-fixture:first',
      manifestId: committedMarketManifest.manifestId,
      chainId: 999,
      requestedFromBlock: record.block.number,
      requestedToBlock: record.block.number,
      finalizedHeadBlock: record.block.number,
    };
    const firstRun = await store.startRun(metadata);
    const first = await store.persistRange({
      runId: firstRun,
      chainId: 999,
      manifestId: committedMarketManifest.manifestId,
      checkpointKey: metadata.checkpointKey,
      confirmationLag: 0,
      range: { fromBlock: record.block.number, toBlock: record.block.number },
      checkpointBlock: record.block,
      records: [record],
      logsFetched: 1,
      decodedCount: 1,
      filteredCount: 0,
    });
    await store.completeRun(firstRun);
    expect(first).toEqual({ insertedCount: 1, duplicateCount: 0 });

    const secondRun = await store.startRun({
      ...metadata,
      checkpointKey: 'postgres-fixture:overlap',
    });
    const duplicate = await store.persistRange({
      runId: secondRun,
      chainId: 999,
      manifestId: committedMarketManifest.manifestId,
      checkpointKey: 'postgres-fixture:overlap',
      confirmationLag: 0,
      range: { fromBlock: record.block.number, toBlock: record.block.number },
      checkpointBlock: record.block,
      records: [record],
      logsFetched: 1,
      decodedCount: 1,
      filteredCount: 0,
    });
    expect(duplicate).toEqual({ insertedCount: 0, duplicateCount: 1 });

    const counts = await connection.client<
      { raw_count: string; event_count: string; amount_base_units: string }[]
    >`
      select
        (select count(*) from raw_logs) as raw_count,
        (select count(*) from market_events) as event_count,
        (select amount_base_units from market_events limit 1) as amount_base_units
    `;
    expect(counts[0]).toEqual({
      raw_count: '1',
      event_count: '1',
      amount_base_units: '14790036757',
    });
    expect((await store.getCheckpoint(metadata.checkpointKey))?.nextBlock).toBe(
      record.block.number + 1n,
    );
  });

  it('rejects a conflicting finalized block hash without partial writes', async () => {
    const runId = await store.startRun({
      command: 'backfill',
      checkpointKey: 'postgres-fixture:conflict',
      manifestId: committedMarketManifest.manifestId,
      chainId: 999,
      requestedFromBlock: record.block.number,
      requestedToBlock: record.block.number,
      finalizedHeadBlock: record.block.number,
    });
    await expect(
      store.persistRange({
        runId,
        chainId: 999,
        manifestId: committedMarketManifest.manifestId,
        checkpointKey: 'postgres-fixture:conflict',
        confirmationLag: 0,
        range: { fromBlock: record.block.number, toBlock: record.block.number },
        checkpointBlock: { ...record.block, hash: `0x${'f'.repeat(64)}` },
        records: [],
        logsFetched: 0,
        decodedCount: 0,
        filteredCount: 0,
      }),
    ).rejects.toBeInstanceOf(BlockHashConflictError);

    expect(await store.getCheckpoint('postgres-fixture:conflict')).toBeUndefined();
  });

  it('rejects conflicting raw content and persists diagnosable terminal failures', async () => {
    const runId = await store.startRun({
      command: 'backfill',
      checkpointKey: 'postgres-fixture:raw-conflict',
      manifestId: committedMarketManifest.manifestId,
      chainId: 999,
      requestedFromBlock: record.block.number,
      requestedToBlock: record.block.number,
      finalizedHeadBlock: record.block.number,
    });
    await expect(
      store.persistRange({
        runId,
        chainId: 999,
        manifestId: committedMarketManifest.manifestId,
        checkpointKey: 'postgres-fixture:raw-conflict',
        confirmationLag: 0,
        range: { fromBlock: record.block.number, toBlock: record.block.number },
        checkpointBlock: record.block,
        records: [{ ...record, log: { ...record.log, data: '0x00' } }],
        logsFetched: 1,
        decodedCount: 1,
        filteredCount: 0,
      }),
    ).rejects.toBeInstanceOf(RawLogConflictError);
    expect(await store.getCheckpoint('postgres-fixture:raw-conflict')).toBeUndefined();

    await store.failRun(
      runId,
      { fromBlock: record.block.number, toBlock: record.block.number },
      {
        classification: 'invalid_request',
        retryable: false,
        attempts: 1,
        message: 'deterministic persisted failure',
      },
    );
    const rows = await connection.client<
      { status: string; failure_count: number; classification: string; attempts: number }[]
    >`
      select r.status, r.failure_count, f.classification, f.attempts
      from indexer_runs r
      join ingestion_failures f on f.run_id = r.id
      where r.id = ${runId}
    `;
    expect(rows[0]).toEqual({
      status: 'failed',
      failure_count: 1,
      classification: 'invalid_request',
      attempts: 1,
    });
  });

  it('rebuilds exact hourly fixture aggregates without accumulating derived rows', async () => {
    const ordered = [...records].sort((left, right) =>
      left.block.number < right.block.number ? -1 : left.block.number > right.block.number ? 1 : 0,
    );
    const firstRecord = ordered[0];
    const lastRecord = ordered.at(-1);
    if (!firstRecord || !lastRecord) throw new Error('fixture records are missing');
    const runId = await store.startRun({
      command: 'backfill',
      checkpointKey: 'postgres-fixture:analytics',
      manifestId: committedMarketManifest.manifestId,
      chainId: 999,
      requestedFromBlock: firstRecord.block.number,
      requestedToBlock: lastRecord.block.number,
      finalizedHeadBlock: lastRecord.block.number,
    });
    await store.persistRange({
      runId,
      chainId: 999,
      manifestId: committedMarketManifest.manifestId,
      checkpointKey: 'postgres-fixture:analytics',
      confirmationLag: 0,
      range: { fromBlock: firstRecord.block.number, toBlock: lastRecord.block.number },
      checkpointBlock: lastRecord.block,
      records,
      logsFetched: records.length,
      decodedCount: records.length,
      filteredCount: 0,
    });

    const firstBuild = await rebuildHourlyFlows({
      store: analyticsStore,
      manifest: committedMarketManifest,
    });
    const secondBuild = await rebuildHourlyFlows({
      store: analyticsStore,
      manifest: committedMarketManifest,
    });
    expect(firstBuild).toEqual({
      bucketCount: 2,
      eventCount: 5,
      fromBlock: 40_361_081n,
      toBlock: 40_367_792n,
    });
    expect(secondBuild).toEqual(firstBuild);

    const flows = await getFlows({
      store: analyticsStore,
      manifest: committedMarketManifest,
      fromTimestamp: 1_783_954_800n,
      toTimestamp: 1_783_958_400n,
    });
    expect(flows).toHaveLength(2);
    expect(flows[1]).toMatchObject({
      sourceEventCount: 4,
      supplyBaseUnits: 14_790_036_757n,
      withdrawBaseUnits: 8_215_062_305n,
      netVariableDebtPrincipalBaseUnits: 55_000_000n,
      calculationVersion: CALCULATION_VERSION,
    });
    const count = await connection.client<{ count: string }[]>`
      select count(*) from hourly_flow_aggregates
    `;
    expect(count[0]?.count).toBe('2');
  });

  it('stores an exact block-pinned snapshot once and rejects changed content at the same version', async () => {
    const manifestBlock = {
      number: BigInt(committedMarketManifest.pinnedBlock.number),
      hash: committedMarketManifest.pinnedBlock.hash as Hex,
      timestamp: BigInt(committedMarketManifest.pinnedBlock.timestamp),
    };
    const state: RawMarketState = {
      block: manifestBlock,
      poolImplementationAddress: getAddress(
        committedMarketManifest.contracts.poolImplementation?.address ?? '',
      ),
      physicalAvailableLiquidityBaseUnits: BigInt(
        committedMarketManifest.reserve.physicalAvailableLiquidity,
      ),
      virtualUnderlyingBalanceBaseUnits: BigInt(
        committedMarketManifest.reserve.virtualUnderlyingBalance,
      ),
      totalHTokenSupplyBaseUnits: BigInt(committedMarketManifest.reserve.totalATokenSupply),
      totalVariableDebtBaseUnits: BigInt(committedMarketManifest.reserve.totalVariableDebt),
      totalStableDebtBaseUnits: 0n,
      unbackedBaseUnits: 0n,
      accruedToTreasuryScaledBaseUnits: 0n,
      deficitBaseUnits: BigInt(committedMarketManifest.reserve.deficit),
      liquidityRateRay: BigInt(committedMarketManifest.reserve.liquidityRateRay),
      variableBorrowRateRay: BigInt(committedMarketManifest.reserve.variableBorrowRateRay),
      liquidityIndexRay: BigInt(committedMarketManifest.reserve.liquidityIndexRay),
      variableBorrowIndexRay: BigInt(committedMarketManifest.reserve.variableBorrowIndexRay),
      reserveLastUpdateTimestamp: BigInt(committedMarketManifest.reserve.lastUpdateTimestamp),
      reserveFactorBps: Number(committedMarketManifest.reserve.reserveFactorBps),
      borrowingEnabled: true,
      stableBorrowRateEnabled: false,
      isActive: true,
      isFrozen: false,
    };
    const snapshot = buildMarketSnapshot({
      chainId: 999,
      manifestId: committedMarketManifest.manifestId,
      abiVersion: committedMarketManifest.abiVersion,
      poolAddress: getAddress(committedMarketManifest.contracts.pool?.address ?? ''),
      protocolDataProviderAddress: getAddress(
        committedMarketManifest.contracts.protocolDataProvider?.address ?? '',
      ),
      underlyingAddress: getAddress(committedMarketManifest.tokens.underlying.address),
      hTokenAddress: getAddress(committedMarketManifest.tokens.hToken.address),
      variableDebtTokenAddress: getAddress(
        committedMarketManifest.tokens.variableDebtToken.address,
      ),
      state,
    });
    await expect(analyticsStore.persistSnapshot(snapshot)).resolves.toBe('inserted');
    await expect(analyticsStore.persistSnapshot(snapshot)).resolves.toBe('duplicate');
    await expect(
      analyticsStore.persistSnapshot({
        ...snapshot,
        physicalAvailableLiquidityBaseUnits: snapshot.physicalAvailableLiquidityBaseUnits + 1n,
      }),
    ).rejects.toBeInstanceOf(SnapshotConflictError);
    expect(
      await getCurrentState({ store: analyticsStore, manifest: committedMarketManifest }),
    ).toEqual(snapshot);
  });

  it.runIf(shouldRunNetwork)(
    'runs a clean migration, live backfill, authoritative snapshot, and aggregate smoke path',
    async () => {
      const rpcUrl = process.env.HYPEREVM_ARCHIVE_RPC_URL;
      if (!rpcUrl) throw new Error('HYPEREVM_ARCHIVE_RPC_URL is required for the live smoke test');
      await connection.client`
        truncate table hourly_flow_aggregates, market_snapshots, ingestion_failures,
                       market_events, raw_logs, indexer_checkpoints, indexer_runs,
                       blocks restart identity cascade
      `;
      const pool = committedMarketManifest.contracts.pool;
      if (!pool) throw new Error('manifest Pool is missing');
      const report = await backfill({
        source: new ViemChainSource({ rpcUrl, poolAddress: getAddress(pool.address) }),
        store,
        manifest: committedMarketManifest,
        confirmationLag: 20,
        chunkSize: 50n,
        fromBlock: 40_367_600n,
        toBlock: 40_367_800n,
      });
      expect(report.insertedCount).toBeGreaterThanOrEqual(3);

      const snapshotReport = await createMarketSnapshot({
        source: new ViemMarketStateSource({ rpcUrl }),
        store: analyticsStore,
        manifest: committedMarketManifest,
        blockNumber: 40_367_800n,
        confirmationLag: 20,
      });
      expect(snapshotReport.status).toBe('inserted');
      expect(snapshotReport.snapshot.totalVariableDebtBaseUnits).toBeGreaterThan(0n);
      expect(snapshotReport.snapshot.utilizationRay).toBeGreaterThan(0n);

      const rebuild = await rebuildHourlyFlows({
        store: analyticsStore,
        manifest: committedMarketManifest,
      });
      expect(rebuild.eventCount).toBe(report.insertedCount);
      expect(rebuild.bucketCount).toBeGreaterThan(0);
      const current = await getCurrentState({
        store: analyticsStore,
        manifest: committedMarketManifest,
      });
      expect(current?.block.number).toBe(40_367_800n);
    },
  );
});
