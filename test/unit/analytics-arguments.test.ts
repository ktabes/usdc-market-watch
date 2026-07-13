import { describe, expect, it } from 'vitest';
import { parseAnalyticsArguments } from '../../src/cli/analytics-arguments.js';

describe('analytics CLI arguments', () => {
  it('parses snapshot arguments exactly', () => {
    expect(parseAnalyticsArguments(['snapshot', '--block', '40367800'])).toEqual({
      command: 'snapshot',
      blockNumber: 40_367_800n,
    });
  });

  it('parses rebuild and current-state commands without arguments', () => {
    expect(parseAnalyticsArguments(['rebuild-flows'])).toEqual({ command: 'rebuild-flows' });
    expect(parseAnalyticsArguments(['state'])).toEqual({ command: 'state' });
  });

  it('parses an inclusive Unix timestamp range', () => {
    expect(
      parseAnalyticsArguments([
        'flows',
        '--to-timestamp',
        '1783962000',
        '--from-timestamp',
        '1783954800',
      ]),
    ).toEqual({
      command: 'flows',
      fromTimestamp: 1_783_954_800n,
      toTimestamp: 1_783_962_000n,
    });
  });

  it.each([
    [[]],
    [['snapshot']],
    [['snapshot', '--block', '0']],
    [['snapshot', '--block', '1.5']],
    [['state', '--block', '1']],
    [['flows', '--from-timestamp', '2', '--to-timestamp', '1']],
    [['flows', '--from-timestamp', '1', '--from-timestamp', '2']],
  ])('rejects malformed arguments %#', (arguments_) => {
    expect(() => parseAnalyticsArguments(arguments_)).toThrow();
  });
});
