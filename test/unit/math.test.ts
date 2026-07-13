import { describe, expect, it } from 'vitest';
import {
  annualRateRayToApyRay,
  calculateUtilizationRay,
  formatBaseUnits,
  RAY,
  rayPow,
} from '../../src/protocol/math.js';

describe('exact fixed-point math', () => {
  it.each([
    [0n, 6, '0'],
    [1n, 6, '0.000001'],
    [1_000_000n, 6, '1'],
    [12_345_600n, 6, '12.3456'],
    [-12_345_600n, 6, '-12.3456'],
  ] as const)('formats %s with %s decimals', (value, decimals, expected) => {
    expect(formatBaseUnits(value, decimals)).toBe(expected);
  });

  it('rejects invalid decimal settings', () => {
    expect(() => formatBaseUnits(1n, -1)).toThrow(RangeError);
    expect(() => formatBaseUnits(1n, Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it('calculates utilization entirely in ray bigint arithmetic', () => {
    expect(calculateUtilizationRay(75n, 25n)).toBe(RAY / 4n);
    expect(calculateUtilizationRay(0n, 0n)).toBe(0n);
    expect(calculateUtilizationRay(100n, 0n)).toBe(0n);
  });

  it('computes per-second compounded APY without JavaScript number', () => {
    const apr = RAY / 20n;
    const apy = annualRateRayToApyRay(apr);
    expect(apy).toBeGreaterThan(apr);
    expect(annualRateRayToApyRay(0n)).toBe(0n);
    expect(rayPow(RAY, 365n)).toBe(RAY);
  });
});
