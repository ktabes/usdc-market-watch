import type { BlockRange } from './types.js';

export const HYPERLEND_MAX_LOG_RANGE = 50n;

export function planLogRanges(
  fromBlock: bigint,
  toBlock: bigint,
  chunkSize: bigint = HYPERLEND_MAX_LOG_RANGE,
): readonly BlockRange[] {
  if (fromBlock < 0n || toBlock < 0n) throw new RangeError('block numbers must be non-negative');
  if (toBlock < fromBlock)
    throw new RangeError('toBlock must be greater than or equal to fromBlock');
  if (chunkSize < 1n || chunkSize > HYPERLEND_MAX_LOG_RANGE) {
    throw new RangeError(`chunkSize must be between 1 and ${HYPERLEND_MAX_LOG_RANGE}`);
  }

  const ranges: BlockRange[] = [];
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = start + chunkSize - 1n;
    ranges.push({ fromBlock: start, toBlock: end < toBlock ? end : toBlock });
  }
  return ranges;
}
