import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  decodeMarketEvent,
  isUsdcMarketEvent,
  normalizedEventToJson,
} from '../../src/protocol/events.js';

const fixturePath = fileURLToPath(
  new URL('../../fixtures/events/hyperlend-usdc-core.v1.json', import.meta.url),
);

const fixtureFileSchema = z.object({
  schemaVersion: z.literal(1),
  chainId: z.literal(999),
  fixtures: z.array(
    z.object({
      event: z.enum(['Supply', 'Withdraw', 'Borrow', 'Repay', 'LiquidationCall']),
      topics: z.array(z.string().regex(/^0x[0-9a-f]{64}$/)).min(1),
      data: z.string().regex(/^0x[0-9a-f]*$/),
      sourceUrl: z.string().url(),
      expected: z.record(z.string(), z.unknown()),
    }),
  ),
});

describe('recorded HyperLend USDC event fixtures', () => {
  it('decodes all five required event types to expected normalized fields', async () => {
    const fixtureFile = fixtureFileSchema.parse(
      JSON.parse(await readFile(fixturePath, 'utf8')) as unknown,
    );

    expect(fixtureFile.fixtures.map((fixture) => fixture.event)).toEqual([
      'Supply',
      'Withdraw',
      'Borrow',
      'Repay',
      'LiquidationCall',
    ]);

    for (const fixture of fixtureFile.fixtures) {
      const decoded = decodeMarketEvent({
        topics: fixture.topics as readonly Hex[],
        data: fixture.data as Hex,
      });
      expect(normalizedEventToJson(decoded), fixture.event).toEqual(fixture.expected);
      expect(isUsdcMarketEvent(decoded), fixture.event).toBe(true);
    }
  });
});
