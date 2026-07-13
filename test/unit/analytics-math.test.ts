import { getAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  aggregateHourlyFlows,
  buildMarketSnapshot,
  CALCULATION_VERSION,
  hourStartTimestamp,
  InvalidAggregateEventError,
  UnsupportedBorrowModeError,
} from '../../src/analytics/math.js';
import type { RawMarketState, TimedMarketEvent } from '../../src/analytics/types.js';
import { RAY } from '../../src/protocol/math.js';

const usdc = getAddress('0xb88339CB7199b77E23DB6E890353E22632Ba630f');
const user = getAddress('0x0000000000000000000000000000000000000001');
const other = getAddress('0x0000000000000000000000000000000000000002');

describe('Phase 3 analytics math', () => {
  it('buckets timestamps at exact UTC-hour boundaries', () => {
    expect(hourStartTimestamp(3_599n)).toBe(0n);
    expect(hourStartTimestamp(3_600n)).toBe(3_600n);
    expect(() => hourStartTimestamp(-1n)).toThrow(RangeError);
  });

  it('derives principal effects for underlying and aToken repayment paths', () => {
    const events: TimedMarketEvent[] = [
      {
        blockNumber: 10n,
        blockTimestamp: 3_700n,
        event: {
          eventType: 'Supply',
          reserve: usdc,
          user,
          onBehalfOf: user,
          amountBaseUnits: 1_000n,
          referralCode: 0,
        },
      },
      {
        blockNumber: 11n,
        blockTimestamp: 3_800n,
        event: {
          eventType: 'Repay',
          reserve: usdc,
          user,
          repayer: user,
          amountBaseUnits: 100n,
          useATokens: false,
        },
      },
      {
        blockNumber: 12n,
        blockTimestamp: 3_900n,
        event: {
          eventType: 'LiquidationCall',
          collateralAsset: usdc,
          debtAsset: other,
          user,
          debtToCoverBaseUnits: 50n,
          liquidatedCollateralBaseUnits: 25n,
          liquidator: other,
          receiveAToken: false,
        },
      },
    ];

    const [bucket] = aggregateHourlyFlows({
      chainId: 999,
      manifestId: 'test',
      underlyingAddress: usdc,
      events,
    });
    expect(bucket).toMatchObject({
      sourceFromBlock: 10n,
      sourceToBlock: 12n,
      sourceEventCount: 3,
      supplyBaseUnits: 1_000n,
      repayBaseUnits: 100n,
      liquidationCollateralOutflowBaseUnits: 25n,
      userNetSupplyBaseUnits: 1_000n,
      netVariableDebtPrincipalBaseUnits: -100n,
      hTokenPrincipalDeltaBaseUnits: 975n,
      underlyingLiquidityPrincipalDeltaBaseUnits: 1_075n,
      calculationVersion: CALCULATION_VERSION,
    });
  });

  it('fails closed on unsupported historical borrow mode', () => {
    expect(() =>
      aggregateHourlyFlows({
        chainId: 999,
        manifestId: 'test',
        underlyingAddress: usdc,
        events: [
          {
            blockNumber: 1n,
            blockTimestamp: 1n,
            event: {
              eventType: 'Borrow',
              reserve: usdc,
              user,
              onBehalfOf: user,
              amountBaseUnits: 1n,
              interestRateMode: 1,
              borrowRateRay: 0n,
              referralCode: 0,
            },
          },
        ],
      }),
    ).toThrow(UnsupportedBorrowModeError);
  });

  it('fails closed on an event outside the manifest market', () => {
    expect(() =>
      aggregateHourlyFlows({
        chainId: 999,
        manifestId: 'test',
        underlyingAddress: usdc,
        events: [
          {
            blockNumber: 1n,
            blockTimestamp: 1n,
            event: {
              eventType: 'Supply',
              reserve: other,
              user,
              onBehalfOf: user,
              amountBaseUnits: 1n,
              referralCode: 0,
            },
          },
        ],
      }),
    ).toThrow(InvalidAggregateEventError);
  });

  it('builds a block-pinned snapshot with exact half-up utilization and zero denominator', () => {
    const baseState: RawMarketState = {
      block: { number: 20n, hash: `0x${'1'.repeat(64)}`, timestamp: 7_200n },
      poolImplementationAddress: other,
      physicalAvailableLiquidityBaseUnits: 2n,
      virtualUnderlyingBalanceBaseUnits: 2n,
      totalHTokenSupplyBaseUnits: 5n,
      totalVariableDebtBaseUnits: 1n,
      totalStableDebtBaseUnits: 0n,
      unbackedBaseUnits: 0n,
      accruedToTreasuryScaledBaseUnits: 0n,
      deficitBaseUnits: 0n,
      liquidityRateRay: 1n,
      variableBorrowRateRay: 2n,
      liquidityIndexRay: RAY,
      variableBorrowIndexRay: RAY,
      reserveLastUpdateTimestamp: 7_199n,
      reserveFactorBps: 1_000,
      borrowingEnabled: true,
      stableBorrowRateEnabled: false,
      isActive: true,
      isFrozen: false,
    };
    const build = (state: RawMarketState) =>
      buildMarketSnapshot({
        chainId: 999,
        manifestId: 'test',
        abiVersion: 'abi',
        poolAddress: user,
        protocolDataProviderAddress: other,
        underlyingAddress: usdc,
        hTokenAddress: user,
        variableDebtTokenAddress: other,
        state,
      });

    expect(build(baseState).utilizationRay).toBe((RAY + 1n) / 3n);
    expect(
      build({
        ...baseState,
        virtualUnderlyingBalanceBaseUnits: 0n,
        totalVariableDebtBaseUnits: 0n,
      }).utilizationRay,
    ).toBe(0n);
  });
});
