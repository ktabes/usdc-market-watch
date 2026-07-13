import { describe, expect, it } from 'vitest';
import { marketCandidates } from '../../src/protocol/addresses.js';
import {
  DiscoveryValidationError,
  validateContractCode,
  validateExpectedValue,
  validateHyperEvmChainId,
} from '../../src/protocol/discover.js';

describe('fail-closed discovery validation', () => {
  it('accepts only the configured HyperEVM chain', () => {
    expect(() => validateHyperEvmChainId(999)).not.toThrow();
    expect(() => validateHyperEvmChainId(998)).toThrowError(
      new DiscoveryValidationError(['chain ID: expected 999, received 998']),
    );
  });

  it('rejects a mismatched address relationship', () => {
    expect(() =>
      validateExpectedValue(
        'addressesProvider.pool',
        marketCandidates.pool,
        marketCandidates.oracle,
      ),
    ).toThrow(/addressesProvider\.pool: expected .* received/);
  });

  it('rejects mismatched reserve configuration', () => {
    expect(() => validateExpectedValue('reserveConfiguration.decimals', 6, 18)).toThrow(
      /reserveConfiguration\.decimals: expected 6, received 18/,
    );
    expect(() => validateExpectedValue('reserveConfiguration.isActive', true, false)).toThrow(
      /reserveConfiguration\.isActive: expected true, received false/,
    );
  });

  it('rejects an address without deployed bytecode', () => {
    expect(() => validateContractCode('pool', marketCandidates.pool, undefined)).toThrow(
      /pool: no contract code/,
    );
    expect(() => validateContractCode('pool', marketCandidates.pool, '0x')).toThrow(
      /pool: no contract code/,
    );
  });

  it('returns stable code and relationship evidence for valid values', () => {
    expect(validateExpectedValue('USDC.decimals', 6, 6)).toEqual({
      name: 'USDC.decimals',
      status: 'PASS',
      expected: '6',
      actual: '6',
    });
    expect(validateContractCode('pool', marketCandidates.pool, '0x6000')).toMatchObject({
      address: marketCandidates.pool,
      codeSizeBytes: 2,
    });
  });
});
