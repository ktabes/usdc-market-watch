import { getAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import { MemoryIndexerStore } from '../../src/indexer/memory-store.js';
import { backfill } from '../../src/indexer/service.js';
import { ViemChainSource } from '../../src/indexer/source.js';
import { protocolSources } from '../../src/protocol/addresses.js';
import { committedMarketManifest } from '../../src/protocol/committed-manifest.js';

const shouldRun = process.env.RUN_NETWORK_INTEGRATION_TESTS === 'true';
const describeWithNetwork = shouldRun ? describe : describe.skip;

describeWithNetwork('overlapping HyperLend network backfill', () => {
  it('indexes a finalized historical range and deduplicates an overlap', async () => {
    const pool = committedMarketManifest.contracts.pool;
    if (!pool) throw new Error('committed manifest is missing Pool contract');
    const source = new ViemChainSource({
      rpcUrl: process.env.HYPEREVM_ARCHIVE_RPC_URL ?? protocolSources.archiveRpc,
      poolAddress: getAddress(pool.address),
    });
    const store = new MemoryIndexerStore();
    const common = {
      source,
      store,
      manifest: committedMarketManifest,
      confirmationLag: 20,
      chunkSize: 50n,
    };

    const first = await backfill({
      ...common,
      fromBlock: 40_367_600n,
      toBlock: 40_367_800n,
    });
    expect(first.insertedCount).toBeGreaterThanOrEqual(3);
    expect([...store.records.values()].map((record) => record.event.eventType)).toEqual(
      expect.arrayContaining(['Supply', 'Withdraw', 'Borrow']),
    );
    const firstCount = store.records.size;

    const overlap = await backfill({
      ...common,
      fromBlock: 40_367_650n,
      toBlock: 40_367_800n,
    });
    expect(overlap.insertedCount).toBe(0);
    expect(overlap.duplicateCount).toBeGreaterThanOrEqual(2);
    expect(store.records.size).toBe(firstCount);
  }, 60_000);
});
