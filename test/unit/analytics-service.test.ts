import { getAddress, type Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { CALCULATION_VERSION } from '../../src/analytics/math.js';
import { createMarketSnapshot } from '../../src/analytics/service.js';
import type {
  AnalyticsStore,
  HourlyFlowAggregate,
  MarketSnapshot,
  MarketStateSource,
  RawMarketState,
  RebuildFlowsResult,
} from '../../src/analytics/types.js';
import { committedMarketManifest } from '../../src/protocol/committed-manifest.js';

const blockNumber = BigInt(committedMarketManifest.pinnedBlock.number);
const rawState: RawMarketState = {
  block: {
    number: blockNumber,
    hash: committedMarketManifest.pinnedBlock.hash as Hex,
    timestamp: BigInt(committedMarketManifest.pinnedBlock.timestamp),
  },
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
  borrowingEnabled: committedMarketManifest.reserve.borrowingEnabled,
  stableBorrowRateEnabled: committedMarketManifest.reserve.stableBorrowRateEnabled,
  isActive: committedMarketManifest.reserve.isActive,
  isFrozen: committedMarketManifest.reserve.isFrozen,
};

class FakeSource implements MarketStateSource {
  readCount = 0;

  getChainId(): Promise<number> {
    return Promise.resolve(999);
  }

  getLatestBlockNumber(): Promise<bigint> {
    return Promise.resolve(blockNumber + 20n);
  }

  readMarketState(): Promise<RawMarketState> {
    this.readCount += 1;
    return Promise.resolve(rawState);
  }
}

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

describe('market snapshot service', () => {
  it('persists exact manifest, block, contract, calculation, and raw-state provenance', async () => {
    const source = new FakeSource();
    const store = new CapturingStore();
    const report = await createMarketSnapshot({
      source,
      store,
      manifest: committedMarketManifest,
      blockNumber,
      confirmationLag: 20,
    });

    expect(report.status).toBe('inserted');
    expect(store.snapshot).toMatchObject({
      manifestId: committedMarketManifest.manifestId,
      block: rawState.block,
      poolAddress: getAddress(committedMarketManifest.contracts.pool?.address ?? ''),
      underlyingAddress: getAddress(committedMarketManifest.tokens.underlying.address),
      physicalAvailableLiquidityBaseUnits: rawState.physicalAvailableLiquidityBaseUnits,
      totalVariableDebtBaseUnits: rawState.totalVariableDebtBaseUnits,
      abiVersion: committedMarketManifest.abiVersion,
      calculationVersion: CALCULATION_VERSION,
    });
  });

  it('rejects a non-finalized block before performing state reads', async () => {
    const source = new FakeSource();
    const store = new CapturingStore();
    await expect(
      createMarketSnapshot({
        source,
        store,
        manifest: committedMarketManifest,
        blockNumber: blockNumber + 1n,
        confirmationLag: 20,
      }),
    ).rejects.toThrow('exceeds finalized head');
    expect(source.readCount).toBe(0);
  });
});
