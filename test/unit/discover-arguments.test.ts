import { describe, expect, it } from 'vitest';
import { parseDiscoverArguments } from '../../src/cli/discover-arguments.js';

describe('discover command arguments', () => {
  it('requires a positive pinned block', () => {
    expect(() => parseDiscoverArguments(['discover'], {})).toThrow('--block');
    expect(() => parseDiscoverArguments(['discover', '--block', '0'], {})).toThrow('--block');
    expect(() => parseDiscoverArguments(['discover', '--block', '1.5'], {})).toThrow('--block');
  });

  it('requires a validated archive RPC URL', () => {
    expect(() => parseDiscoverArguments(['discover', '--block', '1'], {})).toThrow(
      'HYPEREVM_ARCHIVE_RPC_URL',
    );
    expect(() =>
      parseDiscoverArguments(['discover', '--block', '1', '--rpc-url', 'ftp://example.test'], {}),
    ).toThrow('http');
  });

  it.each([
    'https://user:secret@rpc.example.test/archive',
    'https://rpc.example.test/archive?apiKey=secret',
    'https://rpc.example.test/archive#secret',
  ])('rejects credential-bearing RPC URL %s', (rpcUrl) => {
    expect(() =>
      parseDiscoverArguments(['discover', '--block', '1', '--rpc-url', rpcUrl], {}),
    ).toThrow('public non-secret endpoint');
  });

  it('parses block, RPC override, and output path', () => {
    expect(
      parseDiscoverArguments(
        [
          'discover',
          '--block',
          '40367898',
          '--rpc-url',
          'https://rpc.example.test/archive',
          '--out',
          'manifest.json',
        ],
        {},
      ),
    ).toEqual({
      blockNumber: 40_367_898n,
      rpcUrl: 'https://rpc.example.test/archive',
      outputPath: 'manifest.json',
    });
  });
});
