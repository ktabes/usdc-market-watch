import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getAddress, type Address, type Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { MemoryIndexerStore } from '../../src/indexer/memory-store.js';
import { backfill, CheckpointValidationError, sync } from '../../src/indexer/service.js';
import type { BlockRange, ChainBlock, ChainLog, ChainSource } from '../../src/indexer/types.js';
import { committedMarketManifest } from '../../src/protocol/committed-manifest.js';

interface FixtureLog {
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

function syntheticHash(blockNumber: bigint): Hex {
  return `0x${blockNumber.toString(16).padStart(64, '0')}`;
}

class RecordedSource implements ChainSource {
  readonly failedStarts = new Set<bigint>();
  readonly blockHashOverrides = new Map<bigint, Hex>();
  failOnceAt?: bigint;

  constructor(
    readonly logs: readonly ChainLog[],
    readonly fixtureBlocks: ReadonlyMap<bigint, ChainBlock>,
    readonly latestBlock: bigint,
  ) {}

  getChainId(): Promise<number> {
    return Promise.resolve(999);
  }

  getLatestBlockNumber(): Promise<bigint> {
    return Promise.resolve(this.latestBlock);
  }

  getBlock(blockNumber: bigint): Promise<ChainBlock> {
    const fixture = this.fixtureBlocks.get(blockNumber);
    const hash =
      this.blockHashOverrides.get(blockNumber) ?? fixture?.hash ?? syntheticHash(blockNumber);
    return Promise.resolve({
      number: blockNumber,
      hash,
      timestamp: fixture?.timestamp ?? blockNumber * 2n,
    });
  }

  getMarketLogs(range: BlockRange): Promise<readonly ChainLog[]> {
    if (this.failOnceAt === range.fromBlock && !this.failedStarts.has(range.fromBlock)) {
      this.failedStarts.add(range.fromBlock);
      return Promise.reject(new Error('invalid params: deterministic interruption'));
    }
    return Promise.resolve(
      this.logs.filter(
        (log) => log.blockNumber >= range.fromBlock && log.blockNumber <= range.toBlock,
      ),
    );
  }
}

async function recordedFixtureSource() {
  const file = JSON.parse(await readFile(fixturePath, 'utf8')) as { fixtures: FixtureLog[] };
  const blocks = new Map<bigint, ChainBlock>();
  const logs = file.fixtures.map((fixture): ChainLog => {
    const number = BigInt(fixture.blockNumber);
    blocks.set(number, {
      number,
      hash: fixture.blockHash,
      timestamp: BigInt(fixture.blockTimestamp),
    });
    return {
      blockNumber: number,
      blockHash: fixture.blockHash,
      transactionHash: fixture.transactionHash,
      transactionIndex: fixture.transactionIndex,
      logIndex: fixture.logIndex,
      address: getAddress(fixture.address),
      topics: fixture.topics,
      data: fixture.data,
    };
  });
  const maximum = logs.reduce(
    (current, log) => (log.blockNumber > current ? log.blockNumber : current),
    0n,
  );
  return new RecordedSource(logs, blocks, maximum + 20n);
}

const common = (source: ChainSource, store: MemoryIndexerStore) => ({
  source,
  store,
  manifest: committedMarketManifest,
  confirmationLag: 20,
  chunkSize: 50n,
});

describe('restartable and idempotent indexing', () => {
  it('backfills all recorded fixtures once and preserves uniqueness across overlap', async () => {
    const source = await recordedFixtureSource();
    const store = new MemoryIndexerStore();
    const first = await backfill({
      ...common(source, store),
      fromBlock: 40_361_081n,
      toBlock: 40_367_792n,
    });

    expect(first.insertedCount).toBe(5);
    expect(store.records.size).toBe(5);
    expect([...store.records.values()].map((record) => record.event.eventType).sort()).toEqual([
      'Borrow',
      'LiquidationCall',
      'Repay',
      'Supply',
      'Withdraw',
    ]);

    const overlap = await backfill({
      ...common(source, store),
      fromBlock: 40_367_490n,
      toBlock: 40_367_792n,
    });
    expect(overlap.insertedCount).toBe(0);
    expect(overlap.duplicateCount).toBe(4);
    expect(store.records.size).toBe(5);

    const runCount = store.runs.size;
    const completedRerun = await backfill({
      ...common(source, store),
      fromBlock: 40_361_081n,
      toBlock: 40_367_792n,
    });
    expect(completedRerun.noOp).toBe(true);
    expect(store.runs.size).toBe(runCount);
  });

  it('resumes from the last atomic range after an interruption', async () => {
    const source = await recordedFixtureSource();
    const store = new MemoryIndexerStore();
    source.failOnceAt = 40_361_130n;

    await expect(
      backfill({
        ...common(source, store),
        fromBlock: 40_361_080n,
        toBlock: 40_361_180n,
      }),
    ).rejects.toThrow('deterministic interruption');
    const key = `backfill:${committedMarketManifest.manifestId}:40361080:40361180`;
    expect(store.checkpoints.get(key)?.nextBlock).toBe(40_361_130n);
    expect(store.records.size).toBe(1);
    expect([...store.runs.values()][0]?.status).toBe('failed');
    expect(store.failures[0]?.failure).toMatchObject({
      classification: 'invalid_request',
      retryable: false,
      attempts: 1,
    });

    const resumed = await backfill({
      ...common(source, store),
      fromBlock: 40_361_080n,
      toBlock: 40_361_180n,
    });
    expect(resumed.rangesCompleted).toBe(2);
    expect(resumed.insertedCount).toBe(0);
    expect(store.records.size).toBe(1);
    expect(store.checkpoints.get(key)?.nextBlock).toBe(40_361_181n);
  });

  it('syncs finalized blocks incrementally and performs no database mutation when caught up', async () => {
    const fixtureSource = await recordedFixtureSource();
    const template = fixtureSource.logs.find((log) => log.blockNumber === 40_367_615n);
    if (!template) throw new Error('Supply fixture is missing');
    const pinned = BigInt(committedMarketManifest.pinnedBlock.number);
    const eventBlock = pinned + 1n;
    const eventHash = syntheticHash(eventBlock);
    const log: ChainLog = { ...template, blockNumber: eventBlock, blockHash: eventHash };
    const source = new RecordedSource(
      [log],
      new Map([[eventBlock, { number: eventBlock, hash: eventHash, timestamp: eventBlock * 2n }]]),
      pinned + 30n,
    );
    const store = new MemoryIndexerStore();

    const first = await sync(common(source, store));
    expect(first.insertedCount).toBe(1);
    expect(first.requestedToBlock).toBe(pinned + 10n);
    const runCount = store.runs.size;
    const recordCount = store.records.size;

    const second = await sync(common(source, store));
    expect(second.noOp).toBe(true);
    expect(store.runs.size).toBe(runCount);
    expect(store.records.size).toBe(recordCount);
  });

  it('fails closed when a saved finalized checkpoint hash changes', async () => {
    const source = await recordedFixtureSource();
    const store = new MemoryIndexerStore();
    await backfill({
      ...common(source, store),
      fromBlock: 40_367_600n,
      toBlock: 40_367_650n,
    });
    source.blockHashOverrides.set(40_367_650n, syntheticHash(999n));

    await expect(
      backfill({
        ...common(source, store),
        fromBlock: 40_367_600n,
        toBlock: 40_367_650n,
      }),
    ).rejects.toBeInstanceOf(CheckpointValidationError);
  });
});
