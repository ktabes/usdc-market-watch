import { describe, expect, it } from 'vitest';
import { EnvironmentValidationError, parseEnv } from '../../src/config/env.js';

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/market_watch',
  HYPEREVM_RPC_URL: 'https://rpc.example.test/evm',
  HYPEREVM_ARCHIVE_RPC_URL: 'https://archive-rpc.example.test/evm',
  HYPEREVM_CHAIN_ID: '999',
  CONFIRMATION_LAG: '20',
  LOG_BLOCK_CHUNK_SIZE: '50',
  LOG_LEVEL: 'info',
};

describe('parseEnv', () => {
  it('parses and types a valid environment', () => {
    expect(parseEnv(validEnvironment)).toEqual({
      nodeEnv: 'test',
      databaseUrl: validEnvironment.DATABASE_URL,
      hyperEvmRpcUrl: validEnvironment.HYPEREVM_RPC_URL,
      hyperEvmArchiveRpcUrl: validEnvironment.HYPEREVM_ARCHIVE_RPC_URL,
      hyperEvmChainId: 999,
      confirmationLag: 20,
      logBlockChunkSize: 50,
      logLevel: 'info',
    });
  });

  it('reports every missing required value together', () => {
    expect(() => parseEnv({ NODE_ENV: 'test' })).toThrow(EnvironmentValidationError);

    try {
      parseEnv({ NODE_ENV: 'test' });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentValidationError);
      expect((error as EnvironmentValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('DATABASE_URL'),
          expect.stringContaining('HYPEREVM_RPC_URL'),
          expect.stringContaining('HYPEREVM_ARCHIVE_RPC_URL'),
          expect.stringContaining('HYPEREVM_CHAIN_ID'),
          expect.stringContaining('CONFIRMATION_LAG'),
          expect.stringContaining('LOG_BLOCK_CHUNK_SIZE'),
        ]),
      );
    }
  });

  it.each([
    ['DATABASE_URL', 'https://not-postgres.example'],
    ['HYPEREVM_RPC_URL', 'ftp://rpc.example.test'],
    ['HYPEREVM_ARCHIVE_RPC_URL', 'ftp://archive-rpc.example.test'],
    ['HYPEREVM_CHAIN_ID', '0'],
    ['CONFIRMATION_LAG', '-1'],
    ['LOG_BLOCK_CHUNK_SIZE', '1.5'],
    ['LOG_BLOCK_CHUNK_SIZE', '51'],
    ['NODE_ENV', 'staging'],
    ['LOG_LEVEL', 'verbose'],
  ])('rejects malformed %s', (name, value) => {
    expect(() => parseEnv({ ...validEnvironment, [name]: value })).toThrow(
      EnvironmentValidationError,
    );
  });

  it('does not include database credentials in its returned validation errors', () => {
    const secret = 'do-not-print-this-password';
    let thrown: unknown;

    try {
      parseEnv({ ...validEnvironment, DATABASE_URL: `mysql://user:${secret}@localhost/db` });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EnvironmentValidationError);
    expect((thrown as Error).message).not.toContain(secret);
  });
});
