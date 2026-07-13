import { describe, expect, it } from 'vitest';
import { HYPERLEND_MAX_LOG_RANGE, planLogRanges } from '../../src/indexer/ranges.js';

describe('HyperLend log range planner', () => {
  it('covers an inclusive range exactly without exceeding 50 blocks', () => {
    expect(planLogRanges(100n, 220n)).toEqual([
      { fromBlock: 100n, toBlock: 149n },
      { fromBlock: 150n, toBlock: 199n },
      { fromBlock: 200n, toBlock: 220n },
    ]);
    expect(HYPERLEND_MAX_LOG_RANGE).toBe(50n);
  });

  it('supports an exact one-block range and custom smaller chunks', () => {
    expect(planLogRanges(5n, 5n)).toEqual([{ fromBlock: 5n, toBlock: 5n }]);
    expect(planLogRanges(1n, 5n, 2n)).toEqual([
      { fromBlock: 1n, toBlock: 2n },
      { fromBlock: 3n, toBlock: 4n },
      { fromBlock: 5n, toBlock: 5n },
    ]);
  });

  it.each([
    [-1n, 1n, 1n],
    [2n, 1n, 1n],
    [1n, 2n, 0n],
    [1n, 100n, 51n],
  ] as const)('rejects invalid range %s..%s chunk %s', (from, to, chunk) => {
    expect(() => planLogRanges(from, to, chunk)).toThrow(RangeError);
  });
});
