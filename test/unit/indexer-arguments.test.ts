import { describe, expect, it } from 'vitest';
import { parseIndexerArguments } from '../../src/cli/indexer-arguments.js';

describe('indexer command arguments', () => {
  it('parses an inclusive backfill range', () => {
    expect(
      parseIndexerArguments(['backfill', '--from-block', '40367600', '--to-block', '40367800']),
    ).toEqual({ command: 'backfill', fromBlock: 40_367_600n, toBlock: 40_367_800n });
  });

  it('parses sync without options', () => {
    expect(parseIndexerArguments(['sync'])).toEqual({ command: 'sync' });
  });

  it.each([
    ['backfill'],
    ['backfill', '--from-block', '2', '--to-block', '1'],
    ['backfill', '--from-block', '-1', '--to-block', '1'],
    ['backfill', '--from-block', '1', '--to-block', '2', '--force'],
    ['sync', '--from-block', '1'],
    ['unknown'],
  ])('rejects invalid arguments %j', (...arguments_) => {
    expect(() => parseIndexerArguments(arguments_)).toThrow();
  });
});
