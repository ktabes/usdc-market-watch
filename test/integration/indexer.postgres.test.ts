import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getAddress, type Address, type Hex } from 'viem';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/client.js';
import { decodeAndFilterMarketLogs } from '../../src/indexer/normalize.js';
import {
  BlockHashConflictError,
  PostgresIndexerStore,
  RawLogConflictError,
} from '../../src/indexer/postgres-store.js';
import type { ChainBlock, ChainLog } from '../../src/indexer/types.js';
import { committedMarketManifest } from '../../src/protocol/committed-manifest.js';

const shouldRun = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = shouldRun ? describe : describe.skip;

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
  let record: ReturnType<typeof decodeAndFilterMarketLogs>['records'][number];

  beforeAll(async () => {
    await migrate(connection.database, { migrationsFolder: 'drizzle' });
    await connection.client`
      truncate table ingestion_failures, market_events, raw_logs, indexer_checkpoints,
                     indexer_runs, blocks restart identity cascade
    `;
    const fixtureFile = JSON.parse(await readFile(fixturePath, 'utf8')) as {
      fixtures: Fixture[];
    };
    const fixture = fixtureFile.fixtures[0];
    if (!fixture) throw new Error('Supply fixture is missing');
    const block: ChainBlock = {
      number: BigInt(fixture.blockNumber),
      hash: fixture.blockHash,
      timestamp: BigInt(fixture.blockTimestamp),
    };
    const log: ChainLog = {
      blockNumber: block.number,
      blockHash: block.hash,
      transactionHash: fixture.transactionHash,
      transactionIndex: fixture.transactionIndex,
      logIndex: fixture.logIndex,
      address: getAddress(fixture.address),
      topics: fixture.topics,
      data: fixture.data,
    };
    const decoded = decodeAndFilterMarketLogs(
      [log],
      new Map([[block.number, block]]),
      getAddress(committedMarketManifest.tokens.underlying.address),
    );
    const prepared = decoded.records[0];
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
});
