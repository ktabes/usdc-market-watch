import { getAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  SnapshotValidationError,
  validateSnapshotRelationships,
  type SnapshotRelationshipChecks,
} from '../../src/analytics/source.js';

const pool = getAddress('0x0000000000000000000000000000000000000001');
const implementation = getAddress('0x0000000000000000000000000000000000000002');
const addressesProvider = getAddress('0x0000000000000000000000000000000000000003');
const dataProvider = getAddress('0x0000000000000000000000000000000000000004');
const hToken = getAddress('0x0000000000000000000000000000000000000005');
const variableDebtToken = getAddress('0x0000000000000000000000000000000000000006');
const other = getAddress('0x0000000000000000000000000000000000000007');

const validChecks: SnapshotRelationshipChecks = {
  expectedPoolImplementation: implementation,
  actualPoolImplementation: implementation,
  expectedPool: pool,
  providerPool: pool,
  expectedProtocolDataProvider: dataProvider,
  registryProtocolDataProvider: dataProvider,
  expectedPoolAddressesProvider: addressesProvider,
  providerPoolAddressesProvider: addressesProvider,
  expectedHToken: hToken,
  poolHToken: hToken,
  expectedVariableDebtToken: variableDebtToken,
  poolVariableDebtToken: variableDebtToken,
  expectedReserveDecimals: 6,
  reserveDecimals: 6n,
  hTokenTotalSupply: 100n,
  providerHTokenTotalSupply: 100n,
  variableDebtTotalSupply: 40n,
  providerVariableDebtTotalSupply: 40n,
  poolVirtualBalance: 60n,
  providerVirtualBalance: 60n,
  poolDeficit: 0n,
  providerDeficit: 0n,
  stableBorrowingEnabled: false,
  stableDebt: 0n,
};

function validationFailures(checks: SnapshotRelationshipChecks): readonly string[] {
  try {
    validateSnapshotRelationships(checks);
  } catch (error: unknown) {
    if (error instanceof SnapshotValidationError) return error.failures;
    throw error;
  }
  throw new Error('Expected snapshot relationship validation to fail');
}

describe('snapshot relationship validation', () => {
  it('accepts a fully connected current market graph', () => {
    expect(() => validateSnapshotRelationships(validChecks)).not.toThrow();
  });

  it('rejects a stale manifest data provider that differs from the current registry', () => {
    const failures = validationFailures({
      ...validChecks,
      registryProtocolDataProvider: other,
    });
    expect(
      failures.some((failure) =>
        failure.includes('PoolAddressesProvider protocol data provider registry entry'),
      ),
    ).toBe(true);
  });

  it('rejects a provider whose addresses-provider back-reference has drifted', () => {
    const failures = validationFailures({
      ...validChecks,
      providerPoolAddressesProvider: other,
    });
    expect(
      failures.some((failure) =>
        failure.includes('ProtocolDataProvider addresses-provider back-reference'),
      ),
    ).toBe(true);
  });

  it('rejects stable-rate state outside the variable-only calculation boundary', () => {
    const failures = validationFailures({
      ...validChecks,
      stableBorrowingEnabled: true,
      stableDebt: 1n,
    });
    expect(failures.some((failure) => failure.includes('stable borrowing is enabled'))).toBe(true);
    expect(failures.some((failure) => failure.includes('stable debt is nonzero'))).toBe(true);
  });
});
