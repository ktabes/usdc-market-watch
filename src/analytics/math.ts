import type { Address } from 'viem';
import { calculateUtilizationRay } from '../protocol/math.js';
import type {
  HourlyFlowAggregate,
  MarketSnapshot,
  RawMarketState,
  TimedMarketEvent,
} from './types.js';

export const CALCULATION_VERSION = 'hyperlend-usdc-phase3-v1';
export const SECONDS_PER_HOUR = 3_600n;

export class UnsupportedBorrowModeError extends Error {
  constructor(mode: number) {
    super(`unsupported Borrow interestRateMode ${mode}; expected variable mode 2`);
    this.name = 'UnsupportedBorrowModeError';
  }
}

export class InvalidAggregateEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAggregateEventError';
  }
}

function assertNonnegative(name: string, value: bigint): void {
  if (value < 0n) throw new InvalidAggregateEventError(`${name} must be non-negative`);
}

function assertAggregateEvent(event: TimedMarketEvent['event'], underlyingAddress: Address): void {
  if (event.eventType === 'LiquidationCall') {
    if (event.debtAsset !== underlyingAddress && event.collateralAsset !== underlyingAddress) {
      throw new InvalidAggregateEventError('LiquidationCall does not involve the manifest asset');
    }
    assertNonnegative('debtToCoverBaseUnits', event.debtToCoverBaseUnits);
    assertNonnegative('liquidatedCollateralBaseUnits', event.liquidatedCollateralBaseUnits);
    return;
  }
  if (event.reserve !== underlyingAddress) {
    throw new InvalidAggregateEventError(`${event.eventType} reserve is not the manifest asset`);
  }
  assertNonnegative('amountBaseUnits', event.amountBaseUnits);
}

export function hourStartTimestamp(timestamp: bigint): bigint {
  if (timestamp < 0n) throw new RangeError('timestamp must be non-negative');
  return (timestamp / SECONDS_PER_HOUR) * SECONDS_PER_HOUR;
}

interface MutableFlowBucket {
  sourceFromBlock: bigint;
  sourceToBlock: bigint;
  sourceEventCount: number;
  supplyCount: number;
  withdrawCount: number;
  borrowCount: number;
  repayCount: number;
  liquidationCount: number;
  supplyBaseUnits: bigint;
  withdrawBaseUnits: bigint;
  borrowBaseUnits: bigint;
  repayBaseUnits: bigint;
  liquidationDebtRepaidBaseUnits: bigint;
  liquidationCollateralOutflowBaseUnits: bigint;
  userNetSupplyBaseUnits: bigint;
  netVariableDebtPrincipalBaseUnits: bigint;
  hTokenPrincipalDeltaBaseUnits: bigint;
  underlyingLiquidityPrincipalDeltaBaseUnits: bigint;
}

function emptyBucket(blockNumber: bigint): MutableFlowBucket {
  return {
    sourceFromBlock: blockNumber,
    sourceToBlock: blockNumber,
    sourceEventCount: 0,
    supplyCount: 0,
    withdrawCount: 0,
    borrowCount: 0,
    repayCount: 0,
    liquidationCount: 0,
    supplyBaseUnits: 0n,
    withdrawBaseUnits: 0n,
    borrowBaseUnits: 0n,
    repayBaseUnits: 0n,
    liquidationDebtRepaidBaseUnits: 0n,
    liquidationCollateralOutflowBaseUnits: 0n,
    userNetSupplyBaseUnits: 0n,
    netVariableDebtPrincipalBaseUnits: 0n,
    hTokenPrincipalDeltaBaseUnits: 0n,
    underlyingLiquidityPrincipalDeltaBaseUnits: 0n,
  };
}

export function aggregateHourlyFlows(input: {
  readonly chainId: number;
  readonly manifestId: string;
  readonly underlyingAddress: Address;
  readonly events: readonly TimedMarketEvent[];
  readonly calculationVersion?: string;
}): HourlyFlowAggregate[] {
  const buckets = new Map<bigint, MutableFlowBucket>();

  for (const record of input.events) {
    if (record.blockNumber < 0n) throw new InvalidAggregateEventError('block number is negative');
    assertAggregateEvent(record.event, input.underlyingAddress);
    const hour = hourStartTimestamp(record.blockTimestamp);
    const bucket = buckets.get(hour) ?? emptyBucket(record.blockNumber);
    bucket.sourceFromBlock =
      record.blockNumber < bucket.sourceFromBlock ? record.blockNumber : bucket.sourceFromBlock;
    bucket.sourceToBlock =
      record.blockNumber > bucket.sourceToBlock ? record.blockNumber : bucket.sourceToBlock;
    bucket.sourceEventCount += 1;

    switch (record.event.eventType) {
      case 'Supply':
        bucket.supplyCount += 1;
        bucket.supplyBaseUnits += record.event.amountBaseUnits;
        bucket.userNetSupplyBaseUnits += record.event.amountBaseUnits;
        bucket.hTokenPrincipalDeltaBaseUnits += record.event.amountBaseUnits;
        bucket.underlyingLiquidityPrincipalDeltaBaseUnits += record.event.amountBaseUnits;
        break;
      case 'Withdraw':
        bucket.withdrawCount += 1;
        bucket.withdrawBaseUnits += record.event.amountBaseUnits;
        bucket.userNetSupplyBaseUnits -= record.event.amountBaseUnits;
        bucket.hTokenPrincipalDeltaBaseUnits -= record.event.amountBaseUnits;
        bucket.underlyingLiquidityPrincipalDeltaBaseUnits -= record.event.amountBaseUnits;
        break;
      case 'Borrow':
        if (record.event.interestRateMode !== 2) {
          throw new UnsupportedBorrowModeError(record.event.interestRateMode);
        }
        bucket.borrowCount += 1;
        bucket.borrowBaseUnits += record.event.amountBaseUnits;
        bucket.netVariableDebtPrincipalBaseUnits += record.event.amountBaseUnits;
        bucket.underlyingLiquidityPrincipalDeltaBaseUnits -= record.event.amountBaseUnits;
        break;
      case 'Repay':
        bucket.repayCount += 1;
        bucket.repayBaseUnits += record.event.amountBaseUnits;
        bucket.netVariableDebtPrincipalBaseUnits -= record.event.amountBaseUnits;
        if (record.event.useATokens) {
          bucket.hTokenPrincipalDeltaBaseUnits -= record.event.amountBaseUnits;
        } else {
          bucket.underlyingLiquidityPrincipalDeltaBaseUnits += record.event.amountBaseUnits;
        }
        break;
      case 'LiquidationCall':
        bucket.liquidationCount += 1;
        if (record.event.debtAsset === input.underlyingAddress) {
          bucket.liquidationDebtRepaidBaseUnits += record.event.debtToCoverBaseUnits;
          bucket.netVariableDebtPrincipalBaseUnits -= record.event.debtToCoverBaseUnits;
          bucket.underlyingLiquidityPrincipalDeltaBaseUnits += record.event.debtToCoverBaseUnits;
        }
        if (record.event.collateralAsset === input.underlyingAddress) {
          bucket.liquidationCollateralOutflowBaseUnits +=
            record.event.liquidatedCollateralBaseUnits;
          if (!record.event.receiveAToken) {
            bucket.hTokenPrincipalDeltaBaseUnits -= record.event.liquidatedCollateralBaseUnits;
            bucket.underlyingLiquidityPrincipalDeltaBaseUnits -=
              record.event.liquidatedCollateralBaseUnits;
          }
        }
        break;
    }
    buckets.set(hour, bucket);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([hour, bucket]) => ({
      chainId: input.chainId,
      manifestId: input.manifestId,
      hourStartTimestamp: hour,
      ...bucket,
      calculationVersion: input.calculationVersion ?? CALCULATION_VERSION,
    }));
}

export function buildMarketSnapshot(input: {
  readonly chainId: number;
  readonly manifestId: string;
  readonly abiVersion: string;
  readonly poolAddress: Address;
  readonly protocolDataProviderAddress: Address;
  readonly underlyingAddress: Address;
  readonly hTokenAddress: Address;
  readonly variableDebtTokenAddress: Address;
  readonly state: RawMarketState;
  readonly calculationVersion?: string;
}): MarketSnapshot {
  return {
    chainId: input.chainId,
    manifestId: input.manifestId,
    poolAddress: input.poolAddress,
    protocolDataProviderAddress: input.protocolDataProviderAddress,
    underlyingAddress: input.underlyingAddress,
    hTokenAddress: input.hTokenAddress,
    variableDebtTokenAddress: input.variableDebtTokenAddress,
    ...input.state,
    utilizationRay: calculateUtilizationRay(
      input.state.virtualUnderlyingBalanceBaseUnits,
      input.state.totalVariableDebtBaseUnits,
    ),
    abiVersion: input.abiVersion,
    calculationVersion: input.calculationVersion ?? CALCULATION_VERSION,
  };
}
