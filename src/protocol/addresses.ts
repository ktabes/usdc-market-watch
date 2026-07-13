import { getAddress, type Address } from 'viem';

export const HYPEREVM_CHAIN_ID = 999;

export const protocolSources = {
  contractAddresses: 'https://docs.hyperlend.finance/developer-documentation/contract-addresses',
  corePools: 'https://docs.hyperlend.finance/developer-documentation/core-pools',
  dataAndIndexers: 'https://docs.hyperlend.finance/developer-documentation/data-and-indexers',
  archiveRpc: 'https://rpc.hyperlend.finance/archive',
  officialCoreRepository: 'https://github.com/hyperlendx/hyperlend-core',
  coreSourceCommit: '7a2632a22ae2e620b69839f9d08fe9419df050d3',
} as const;

/** Published candidates. Discovery must validate every relationship at a pinned block. */
export const marketCandidates = {
  pool: getAddress('0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b'),
  publishedPoolImplementation: getAddress('0xc19d68383Ed7AB130c15cEad839e67A7Ed9d7041'),
  poolImplementation: getAddress('0xBEBb62C7FF8B96dB4325D9481c44e09A92d49B06'),
  poolAddressesProvider: getAddress('0x72c98246a98bFe64022a3190e7710E157497170C'),
  publishedProtocolDataProvider: getAddress('0x5481bf8d3946E6A3168640c1D7523eB59F055a29'),
  protocolDataProvider: getAddress('0x4f4d4cA1e0a8A21FE0B460613bEbe917f2eb4326'),
  oracle: getAddress('0xC9Fb4fbE842d57EAc1dF3e641a281827493A630e'),
  interestRateStrategy: getAddress('0xD01E9AA0ba6a4a06E756BC8C79579E6cef070822'),
  usdc: getAddress('0xb88339CB7199b77E23DB6E890353E22632Ba630f'),
  hToken: getAddress('0x744E4f26ee30213989216E1632D9BE3547C4885b'),
  variableDebtToken: getAddress('0xD612513cB3b2C52abCD6d4b338374C09AdA4657d'),
} as const satisfies Record<string, Address>;

export type MarketContractName = keyof typeof marketCandidates;

export const EIP1967_IMPLEMENTATION_SLOT =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as const;
