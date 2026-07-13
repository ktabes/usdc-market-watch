import { describe, expect, it } from 'vitest';
import { createMarketSnapshot } from '../../src/analytics/service.js';
import { ViemMarketStateSource } from '../../src/analytics/source.js';
import type {
  AnalyticsStore,
  HourlyFlowAggregate,
  MarketSnapshot,
  RebuildFlowsResult,
} from '../../src/analytics/types.js';
import { protocolSources } from '../../src/protocol/addresses.js';
import { committedMarketManifest } from '../../src/protocol/committed-manifest.js';

const shouldRun = process.env.RUN_NETWORK_INTEGRATION_TESTS === 'true';
const describeWithNetwork = shouldRun ? describe : describe.skip;

class CapturingStore implements AnalyticsStore {
  snapshot?: MarketSnapshot;

  persistSnapshot(snapshot: MarketSnapshot): Promise<'inserted'> {
    this.snapshot = snapshot;
    return Promise.resolve('inserted');
  }

  rebuildHourlyFlows(): Promise<RebuildFlowsResult> {
    throw new Error('not used');
  }

  getLatestSnapshot(): Promise<MarketSnapshot | undefined> {
    return Promise.resolve(this.snapshot);
  }

  getHourlyFlows(): Promise<readonly HourlyFlowAggregate[]> {
    return Promise.resolve([]);
  }
}

describeWithNetwork('pinned HyperLend market snapshot', () => {
  it('reproduces authoritative manifest state from direct block-pinned reads', async () => {
    const rpcUrl = process.env.HYPEREVM_ARCHIVE_RPC_URL ?? protocolSources.archiveRpc;
    const store = new CapturingStore();
    const report = await createMarketSnapshot({
      source: new ViemMarketStateSource({ rpcUrl }),
      store,
      manifest: committedMarketManifest,
      blockNumber: BigInt(committedMarketManifest.pinnedBlock.number),
      confirmationLag: 20,
    });

    expect(report.snapshot.block.hash).toBe(committedMarketManifest.pinnedBlock.hash);
    expect(report.snapshot).toMatchObject({
      physicalAvailableLiquidityBaseUnits: BigInt(
        committedMarketManifest.reserve.physicalAvailableLiquidity,
      ),
      virtualUnderlyingBalanceBaseUnits: BigInt(
        committedMarketManifest.reserve.virtualUnderlyingBalance,
      ),
      totalHTokenSupplyBaseUnits: BigInt(committedMarketManifest.reserve.totalATokenSupply),
      totalVariableDebtBaseUnits: BigInt(committedMarketManifest.reserve.totalVariableDebt),
      liquidityRateRay: BigInt(committedMarketManifest.reserve.liquidityRateRay),
      variableBorrowRateRay: BigInt(committedMarketManifest.reserve.variableBorrowRateRay),
      liquidityIndexRay: BigInt(committedMarketManifest.reserve.liquidityIndexRay),
      variableBorrowIndexRay: BigInt(committedMarketManifest.reserve.variableBorrowIndexRay),
      deficitBaseUnits: BigInt(committedMarketManifest.reserve.deficit),
    });
  });
});
