export const RAY = 10n ** 27n;
export const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n;

export function formatBaseUnits(value: bigint, decimals: number): string {
  if (!Number.isSafeInteger(decimals) || decimals < 0) {
    throw new RangeError('decimals must be a non-negative safe integer');
  }

  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const integer = absolute / scale;
  const fraction = absolute % scale;
  const sign = negative ? '-' : '';

  if (fraction === 0n || decimals === 0) return `${sign}${integer.toString()}`;

  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${sign}${integer.toString()}.${fractionText}`;
}

export function rayMulHalfUp(left: bigint, right: bigint): bigint {
  return (left * right + RAY / 2n) / RAY;
}

export function rayPow(baseRay: bigint, exponent: bigint): bigint {
  if (exponent < 0n) throw new RangeError('exponent must be non-negative');

  let base = baseRay;
  let power = exponent;
  let result = RAY;

  while (power > 0n) {
    if (power % 2n === 1n) result = rayMulHalfUp(result, base);
    power /= 2n;
    if (power > 0n) base = rayMulHalfUp(base, base);
  }

  return result;
}

export function annualRateRayToApyRay(annualRateRay: bigint): bigint {
  if (annualRateRay < 0n) throw new RangeError('annual rate must be non-negative');
  const perSecondRate = annualRateRay / SECONDS_PER_YEAR;
  return rayPow(RAY + perSecondRate, SECONDS_PER_YEAR) - RAY;
}

export function calculateUtilizationRay(availableLiquidity: bigint, variableDebt: bigint): bigint {
  if (availableLiquidity < 0n || variableDebt < 0n) {
    throw new RangeError('liquidity and debt must be non-negative');
  }
  if (variableDebt === 0n) return 0n;

  const denominator = availableLiquidity + variableDebt;
  return (variableDebt * RAY + denominator / 2n) / denominator;
}
