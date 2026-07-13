import type { Address, Hex } from 'viem';
import type { NormalizedMarketEvent } from '../protocol/events.js';
import type { MarketManifest } from '../protocol/manifest.js';
import type { ChainBlock } from '../indexer/types.js';

export interface TimedMarketEvent {
  readonly blockNumber: bigint;
  readonly blockTimestamp: bigint;
  readonly event: NormalizedMarketEvent;
}

export interface HourlyFlowAggregate {
  readonly chainId: number;
  readonly manifestId: string;
  readonly hourStartTimestamp: bigint;
  readonly sourceFromBlock: bigint;
  readonly sourceToBlock: bigint;
  readonly sourceEventCount: number;
  readonly supplyCount: number;
  readonly withdrawCount: number;
  readonly borrowCount: number;
  readonly repayCount: number;
  readonly liquidationCount: number;
  readonly supplyBaseUnits: bigint;
  readonly withdrawBaseUnits: bigint;
  readonly borrowBaseUnits: bigint;
  readonly repayBaseUnits: bigint;
  readonly liquidationDebtRepaidBaseUnits: bigint;
  readonly liquidationCollateralOutflowBaseUnits: bigint;
  readonly userNetSupplyBaseUnits: bigint;
  readonly netVariableDebtPrincipalBaseUnits: bigint;
  readonly hTokenPrincipalDeltaBaseUnits: bigint;
  readonly underlyingLiquidityPrincipalDeltaBaseUnits: bigint;
  readonly calculationVersion: string;
}

export interface RawMarketState {
  readonly block: ChainBlock;
  readonly poolImplementationAddress: Address;
  readonly physicalAvailableLiquidityBaseUnits: bigint;
  readonly virtualUnderlyingBalanceBaseUnits: bigint;
  readonly totalHTokenSupplyBaseUnits: bigint;
  readonly totalVariableDebtBaseUnits: bigint;
  readonly totalStableDebtBaseUnits: bigint;
  readonly unbackedBaseUnits: bigint;
  readonly accruedToTreasuryScaledBaseUnits: bigint;
  readonly deficitBaseUnits: bigint;
  readonly liquidityRateRay: bigint;
  readonly variableBorrowRateRay: bigint;
  readonly liquidityIndexRay: bigint;
  readonly variableBorrowIndexRay: bigint;
  readonly reserveLastUpdateTimestamp: bigint;
  readonly reserveFactorBps: number;
  readonly borrowingEnabled: boolean;
  readonly stableBorrowRateEnabled: boolean;
  readonly isActive: boolean;
  readonly isFrozen: boolean;
}

export interface MarketSnapshot extends RawMarketState {
  readonly chainId: number;
  readonly manifestId: string;
  readonly poolAddress: Address;
  readonly protocolDataProviderAddress: Address;
  readonly underlyingAddress: Address;
  readonly hTokenAddress: Address;
  readonly variableDebtTokenAddress: Address;
  readonly utilizationRay: bigint;
  readonly abiVersion: string;
  readonly calculationVersion: string;
}

export interface MarketStateSource {
  getChainId(): Promise<number>;
  getLatestBlockNumber(): Promise<bigint>;
  readMarketState(blockNumber: bigint, manifest: MarketManifest): Promise<RawMarketState>;
}

export interface RebuildFlowsResult {
  readonly bucketCount: number;
  readonly eventCount: number;
  readonly fromBlock?: bigint;
  readonly toBlock?: bigint;
}

export interface AnalyticsStore {
  persistSnapshot(snapshot: MarketSnapshot): Promise<'inserted' | 'duplicate'>;
  rebuildHourlyFlows(input: {
    readonly chainId: number;
    readonly manifestId: string;
    readonly underlyingAddress: Address;
    readonly calculationVersion: string;
  }): Promise<RebuildFlowsResult>;
  getLatestSnapshot(input: {
    readonly chainId: number;
    readonly manifestId: string;
    readonly calculationVersion: string;
  }): Promise<MarketSnapshot | undefined>;
  getHourlyFlows(input: {
    readonly chainId: number;
    readonly manifestId: string;
    readonly calculationVersion: string;
    readonly fromTimestamp: bigint;
    readonly toTimestamp: bigint;
  }): Promise<readonly HourlyFlowAggregate[]>;
}

export interface SnapshotReport {
  readonly blockNumber: bigint;
  readonly blockHash: Hex;
  readonly status: 'inserted' | 'duplicate';
  readonly snapshot: MarketSnapshot;
}
