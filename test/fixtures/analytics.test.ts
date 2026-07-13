import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getAddress, type Address, type Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { aggregateHourlyFlows } from '../../src/analytics/math.js';
import type { TimedMarketEvent } from '../../src/analytics/types.js';
import { decodeMarketEvent } from '../../src/protocol/events.js';
import { committedMarketManifest } from '../../src/protocol/committed-manifest.js';

interface Fixture {
  blockNumber: string;
  blockTimestamp: string;
  address: Address;
  topics: Hex[];
  data: Hex;
}

const fixturePath = fileURLToPath(
  new URL('../../fixtures/events/hyperlend-usdc-core.v1.json', import.meta.url),
);

describe('recorded fixture aggregates', () => {
  it('reproduces exact hourly totals and principal effects', async () => {
    const file = JSON.parse(await readFile(fixturePath, 'utf8')) as { fixtures: Fixture[] };
    const events: TimedMarketEvent[] = file.fixtures.map((fixture) => ({
      blockNumber: BigInt(fixture.blockNumber),
      blockTimestamp: BigInt(fixture.blockTimestamp),
      event: decodeMarketEvent({ topics: fixture.topics, data: fixture.data }),
    }));
    const aggregates = aggregateHourlyFlows({
      chainId: 999,
      manifestId: committedMarketManifest.manifestId,
      underlyingAddress: getAddress(committedMarketManifest.tokens.underlying.address),
      events,
    });

    expect(aggregates).toHaveLength(2);
    expect(aggregates[0]).toMatchObject({
      hourStartTimestamp: 1_783_954_800n,
      sourceFromBlock: 40_361_081n,
      sourceToBlock: 40_361_081n,
      sourceEventCount: 1,
      liquidationCount: 1,
      liquidationDebtRepaidBaseUnits: 47_795n,
      liquidationCollateralOutflowBaseUnits: 0n,
      netVariableDebtPrincipalBaseUnits: -47_795n,
      underlyingLiquidityPrincipalDeltaBaseUnits: 47_795n,
    });
    expect(aggregates[1]).toMatchObject({
      hourStartTimestamp: 1_783_958_400n,
      sourceFromBlock: 40_367_497n,
      sourceToBlock: 40_367_792n,
      sourceEventCount: 4,
      supplyCount: 1,
      withdrawCount: 1,
      borrowCount: 1,
      repayCount: 1,
      supplyBaseUnits: 14_790_036_757n,
      withdrawBaseUnits: 8_215_062_305n,
      borrowBaseUnits: 85_000_000n,
      repayBaseUnits: 30_000_000n,
      userNetSupplyBaseUnits: 6_574_974_452n,
      netVariableDebtPrincipalBaseUnits: 55_000_000n,
      hTokenPrincipalDeltaBaseUnits: 6_544_974_452n,
      underlyingLiquidityPrincipalDeltaBaseUnits: 6_489_974_452n,
    });
  });
});
