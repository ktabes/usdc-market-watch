import { getAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import { HYPEREVM_CHAIN_ID, marketCandidates } from '../../src/protocol/addresses.js';

describe('Phase 1 market candidates', () => {
  it('pins HyperEVM chain ID', () => {
    expect(HYPEREVM_CHAIN_ID).toBe(999);
  });

  it.each(Object.entries(marketCandidates))(
    '%s is a valid checksummed address',
    (_name, address) => {
      expect(getAddress(address)).toBe(address);
    },
  );

  it('keeps published and onchain-resolved upgrade candidates distinct', () => {
    expect(marketCandidates.publishedPoolImplementation).not.toBe(
      marketCandidates.poolImplementation,
    );
    expect(marketCandidates.publishedProtocolDataProvider).not.toBe(
      marketCandidates.protocolDataProvider,
    );
  });
});
