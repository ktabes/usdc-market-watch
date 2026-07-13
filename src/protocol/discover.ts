import { createPublicClient, getAddress, http, keccak256, type Address, type Hex } from 'viem';
import {
  addressesProviderAbi,
  ABI_VERSION,
  erc20Abi,
  oracleAbi,
  poolReadAbi,
  protocolDataProviderAbi,
  reserveTokenAbi,
} from './abis.js';
import {
  EIP1967_IMPLEMENTATION_SLOT,
  HYPEREVM_CHAIN_ID,
  marketCandidates,
  protocolSources,
} from './addresses.js';
import { marketManifestSchema, type MarketManifest } from './manifest.js';

interface DiscoverOptions {
  readonly rpcUrl: string;
  readonly blockNumber: bigint;
  readonly generatedAt?: string;
}

interface Check {
  readonly name: string;
  readonly status: 'PASS';
  readonly expected: string;
  readonly actual: string;
}

export class DiscoveryValidationError extends Error {
  readonly failures: readonly string[];

  constructor(failures: readonly string[]) {
    super(`Market discovery validation failed:\n- ${failures.join('\n- ')}`);
    this.name = 'DiscoveryValidationError';
    this.failures = failures;
  }
}

export function validateHyperEvmChainId(chainId: number): void {
  if (chainId !== HYPEREVM_CHAIN_ID) {
    throw new DiscoveryValidationError([
      `chain ID: expected ${HYPEREVM_CHAIN_ID}, received ${chainId}`,
    ]);
  }
}

export function validateExpectedValue(
  name: string,
  expected: bigint | number | boolean | string,
  actual: bigint | number | boolean | string,
): Check {
  const expectedText = stringValue(expected);
  const actualText = stringValue(actual);
  if (expectedText !== actualText) {
    throw new DiscoveryValidationError([
      `${name}: expected ${expectedText}, received ${actualText}`,
    ]);
  }
  return { name, status: 'PASS', expected: expectedText, actual: actualText };
}

export function validateContractCode(name: string, address: Address, bytecode: Hex | undefined) {
  if (!bytecode || bytecode === '0x') {
    throw new DiscoveryValidationError([`${name}: no contract code at ${address}`]);
  }
  return {
    address,
    codeHash: keccak256(bytecode),
    codeSizeBytes: (bytecode.length - 2) / 2,
  };
}

function storageWordToAddress(storage: Hex | undefined): Address {
  if (!storage || storage === '0x') {
    throw new Error('EIP-1967 implementation storage is empty');
  }
  return getAddress(`0x${storage.slice(-40)}`);
}

function stringValue(value: bigint | number | boolean | string): string {
  return typeof value === 'bigint' ? value.toString() : String(value);
}

export async function discoverMarket(options: DiscoverOptions): Promise<MarketManifest> {
  if (options.blockNumber < 1n) throw new RangeError('blockNumber must be positive');

  const client = createPublicClient({
    transport: http(options.rpcUrl, { retryCount: 3, timeout: 20_000 }),
  });
  const chainId = await client.getChainId();
  validateHyperEvmChainId(chainId);

  const block = await client.getBlock({ blockNumber: options.blockNumber });
  const checks: Check[] = [];
  const failures: string[] = [];

  const check = (
    name: string,
    expected: bigint | number | boolean | string,
    actual: bigint | number | boolean | string,
  ) => {
    try {
      checks.push(validateExpectedValue(name, expected, actual));
    } catch (error) {
      if (!(error instanceof DiscoveryValidationError)) throw error;
      failures.push(...error.failures);
    }
  };

  const contractEntries = await Promise.all(
    Object.entries(marketCandidates).map(async ([name, address]) => {
      const bytecode = await client.getBytecode({ address, blockNumber: options.blockNumber });
      try {
        return [name, validateContractCode(name, address, bytecode)] as const;
      } catch (error) {
        if (!(error instanceof DiscoveryValidationError)) throw error;
        failures.push(...error.failures);
        return [name, { address, codeHash: `0x${'0'.repeat(64)}`, codeSizeBytes: 0 }] as const;
      }
    }),
  );

  if (failures.length > 0) throw new DiscoveryValidationError(failures);
  for (const [name, contract] of contractEntries) {
    checks.push({
      name: `${name}.codePresent`,
      status: 'PASS',
      expected: '>0 bytes',
      actual: `${contract.codeSizeBytes} bytes`,
    });
  }

  const poolImplementationStorage = await client.getStorageAt({
    address: marketCandidates.pool,
    slot: EIP1967_IMPLEMENTATION_SLOT,
    blockNumber: options.blockNumber,
  });
  check(
    'pool.eip1967Implementation',
    marketCandidates.poolImplementation,
    storageWordToAddress(poolImplementationStorage),
  );

  const [providerPool, providerOracle, providerDataProvider] = await Promise.all([
    client.readContract({
      address: marketCandidates.poolAddressesProvider,
      abi: addressesProviderAbi,
      functionName: 'getPool',
      blockNumber: options.blockNumber,
    }),
    client.readContract({
      address: marketCandidates.poolAddressesProvider,
      abi: addressesProviderAbi,
      functionName: 'getPriceOracle',
      blockNumber: options.blockNumber,
    }),
    client.readContract({
      address: marketCandidates.poolAddressesProvider,
      abi: addressesProviderAbi,
      functionName: 'getPoolDataProvider',
      blockNumber: options.blockNumber,
    }),
  ]);
  check('addressesProvider.pool', marketCandidates.pool, getAddress(providerPool));
  check('addressesProvider.oracle', marketCandidates.oracle, getAddress(providerOracle));
  check(
    'addressesProvider.protocolDataProvider',
    marketCandidates.protocolDataProvider,
    getAddress(providerDataProvider),
  );

  const [dataProviderAddressesProvider, dataProviderPool, reserveTokens, allReserves] =
    await Promise.all([
      client.readContract({
        address: marketCandidates.protocolDataProvider,
        abi: protocolDataProviderAbi,
        functionName: 'ADDRESSES_PROVIDER',
        blockNumber: options.blockNumber,
      }),
      client.readContract({
        address: marketCandidates.protocolDataProvider,
        abi: protocolDataProviderAbi,
        functionName: 'POOL',
        blockNumber: options.blockNumber,
      }),
      client.readContract({
        address: marketCandidates.protocolDataProvider,
        abi: protocolDataProviderAbi,
        functionName: 'getReserveTokensAddresses',
        args: [marketCandidates.usdc],
        blockNumber: options.blockNumber,
      }),
      client.readContract({
        address: marketCandidates.protocolDataProvider,
        abi: protocolDataProviderAbi,
        functionName: 'getAllReservesTokens',
        blockNumber: options.blockNumber,
      }),
    ]);
  check(
    'protocolDataProvider.addressesProvider',
    marketCandidates.poolAddressesProvider,
    getAddress(dataProviderAddressesProvider),
  );
  check('protocolDataProvider.pool', marketCandidates.pool, getAddress(dataProviderPool));
  check('reserveTokens.hToken', marketCandidates.hToken, getAddress(reserveTokens[0]));
  check(
    'reserveTokens.stableDebtTokenDeprecated',
    '0x0000000000000000000000000000000000000000',
    getAddress(reserveTokens[1]),
  );
  check(
    'reserveTokens.variableDebtToken',
    marketCandidates.variableDebtToken,
    getAddress(reserveTokens[2]),
  );
  const usdcReserve = allReserves.find(
    (reserve) => getAddress(reserve.tokenAddress) === marketCandidates.usdc,
  );
  if (!usdcReserve) failures.push('USDC is absent from getAllReservesTokens()');
  else check('reserveList.USDC.symbol', 'USDC', usdcReserve.symbol);

  const [poolAToken, poolVariableDebtToken, poolVirtualBalance, poolDeficit, rateStrategy] =
    await Promise.all([
      client.readContract({
        address: marketCandidates.pool,
        abi: poolReadAbi,
        functionName: 'getReserveAToken',
        args: [marketCandidates.usdc],
        blockNumber: options.blockNumber,
      }),
      client.readContract({
        address: marketCandidates.pool,
        abi: poolReadAbi,
        functionName: 'getReserveVariableDebtToken',
        args: [marketCandidates.usdc],
        blockNumber: options.blockNumber,
      }),
      client.readContract({
        address: marketCandidates.pool,
        abi: poolReadAbi,
        functionName: 'getVirtualUnderlyingBalance',
        args: [marketCandidates.usdc],
        blockNumber: options.blockNumber,
      }),
      client.readContract({
        address: marketCandidates.pool,
        abi: poolReadAbi,
        functionName: 'getReserveDeficit',
        args: [marketCandidates.usdc],
        blockNumber: options.blockNumber,
      }),
      client.readContract({
        address: marketCandidates.pool,
        abi: poolReadAbi,
        functionName: 'RESERVE_INTEREST_RATE_STRATEGY',
        blockNumber: options.blockNumber,
      }),
    ]);
  check('pool.reserveAToken', marketCandidates.hToken, getAddress(poolAToken));
  check(
    'pool.reserveVariableDebtToken',
    marketCandidates.variableDebtToken,
    getAddress(poolVariableDebtToken),
  );
  check(
    'pool.interestRateStrategy',
    marketCandidates.interestRateStrategy,
    getAddress(rateStrategy),
  );

  const readToken = async (address: Address, reserveToken: boolean) => {
    const abi = reserveToken ? reserveTokenAbi : erc20Abi;
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      client.readContract({ address, abi, functionName: 'name', blockNumber: options.blockNumber }),
      client.readContract({
        address,
        abi,
        functionName: 'symbol',
        blockNumber: options.blockNumber,
      }),
      client.readContract({
        address,
        abi,
        functionName: 'decimals',
        blockNumber: options.blockNumber,
      }),
      client.readContract({
        address,
        abi,
        functionName: 'totalSupply',
        blockNumber: options.blockNumber,
      }),
    ]);
    return { name, symbol, decimals, totalSupply };
  };

  const [underlyingToken, hToken, debtToken] = await Promise.all([
    readToken(marketCandidates.usdc, false),
    readToken(marketCandidates.hToken, true),
    readToken(marketCandidates.variableDebtToken, true),
  ]);
  check('USDC.symbol', 'USDC', underlyingToken.symbol);
  check('USDC.decimals', 6, underlyingToken.decimals);
  check('hToken.decimals', 6, hToken.decimals);
  check('variableDebtToken.decimals', 6, debtToken.decimals);

  const [hTokenUnderlying, hTokenPool, debtUnderlying, debtPool] = await Promise.all([
    client.readContract({
      address: marketCandidates.hToken,
      abi: reserveTokenAbi,
      functionName: 'UNDERLYING_ASSET_ADDRESS',
      blockNumber: options.blockNumber,
    }),
    client.readContract({
      address: marketCandidates.hToken,
      abi: reserveTokenAbi,
      functionName: 'POOL',
      blockNumber: options.blockNumber,
    }),
    client.readContract({
      address: marketCandidates.variableDebtToken,
      abi: reserveTokenAbi,
      functionName: 'UNDERLYING_ASSET_ADDRESS',
      blockNumber: options.blockNumber,
    }),
    client.readContract({
      address: marketCandidates.variableDebtToken,
      abi: reserveTokenAbi,
      functionName: 'POOL',
      blockNumber: options.blockNumber,
    }),
  ]);
  check('hToken.underlying', marketCandidates.usdc, getAddress(hTokenUnderlying));
  check('hToken.pool', marketCandidates.pool, getAddress(hTokenPool));
  check('variableDebtToken.underlying', marketCandidates.usdc, getAddress(debtUnderlying));
  check('variableDebtToken.pool', marketCandidates.pool, getAddress(debtPool));

  const [configuration, reserveData, dataProviderVirtualBalance, dataProviderDeficit] =
    await Promise.all([
      client.readContract({
        address: marketCandidates.protocolDataProvider,
        abi: protocolDataProviderAbi,
        functionName: 'getReserveConfigurationData',
        args: [marketCandidates.usdc],
        blockNumber: options.blockNumber,
      }),
      client.readContract({
        address: marketCandidates.protocolDataProvider,
        abi: protocolDataProviderAbi,
        functionName: 'getReserveData',
        args: [marketCandidates.usdc],
        blockNumber: options.blockNumber,
      }),
      client.readContract({
        address: marketCandidates.protocolDataProvider,
        abi: protocolDataProviderAbi,
        functionName: 'getVirtualUnderlyingBalance',
        args: [marketCandidates.usdc],
        blockNumber: options.blockNumber,
      }),
      client.readContract({
        address: marketCandidates.protocolDataProvider,
        abi: protocolDataProviderAbi,
        functionName: 'getReserveDeficit',
        args: [marketCandidates.usdc],
        blockNumber: options.blockNumber,
      }),
    ]);
  check('reserveConfiguration.decimals', 6, configuration[0]);
  check('reserveConfiguration.isActive', true, configuration[8]);
  check('reserveData.totalStableDebtDeprecated', 0n, reserveData[3]);
  check('reserveData.unbackedDeprecated', 0n, reserveData[0]);
  check('reserveData.totalAToken', hToken.totalSupply, reserveData[2]);
  check('reserveData.totalVariableDebt', debtToken.totalSupply, reserveData[4]);
  check('virtualBalance.poolVsDataProvider', poolVirtualBalance, dataProviderVirtualBalance);
  check('deficit.poolVsDataProvider', poolDeficit, dataProviderDeficit);

  const [physicalAvailableLiquidity, oracleBaseCurrency, oracleBaseCurrencyUnit, oraclePrice] =
    await Promise.all([
      client.readContract({
        address: marketCandidates.usdc,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [marketCandidates.hToken],
        blockNumber: options.blockNumber,
      }),
      client.readContract({
        address: marketCandidates.oracle,
        abi: oracleAbi,
        functionName: 'BASE_CURRENCY',
        blockNumber: options.blockNumber,
      }),
      client.readContract({
        address: marketCandidates.oracle,
        abi: oracleAbi,
        functionName: 'BASE_CURRENCY_UNIT',
        blockNumber: options.blockNumber,
      }),
      client.readContract({
        address: marketCandidates.oracle,
        abi: oracleAbi,
        functionName: 'getAssetPrice',
        args: [marketCandidates.usdc],
        blockNumber: options.blockNumber,
      }),
    ]);
  if (oracleBaseCurrencyUnit === 0n) failures.push('oracle base currency unit is zero');
  else
    checks.push({
      name: 'oracle.baseCurrencyUnitPositive',
      status: 'PASS',
      expected: '>0',
      actual: oracleBaseCurrencyUnit.toString(),
    });
  if (oraclePrice === 0n) failures.push('oracle price is zero');
  else
    checks.push({
      name: 'oracle.USDC.pricePositive',
      status: 'PASS',
      expected: '>0',
      actual: oraclePrice.toString(),
    });

  if (failures.length > 0) throw new DiscoveryValidationError(failures);

  const manifest: MarketManifest = {
    schemaVersion: 1,
    manifestId: `hyperlend-core-usdc-${HYPEREVM_CHAIN_ID}-${options.blockNumber.toString()}`,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    abiVersion: ABI_VERSION,
    source: {
      documentationObservedAt: '2026-07-13',
      contractAddressesUrl: protocolSources.contractAddresses,
      corePoolsUrl: protocolSources.corePools,
      dataAndIndexersUrl: protocolSources.dataAndIndexers,
      coreRepositoryUrl: protocolSources.officialCoreRepository,
      coreSourceCommit: protocolSources.coreSourceCommit,
      candidateDiscrepancies: [
        {
          name: 'PoolImplementation',
          publishedCandidate: marketCandidates.publishedPoolImplementation,
          validatedAddress: marketCandidates.poolImplementation,
          resolution:
            'The active implementation is read from the Pool proxy EIP-1967 implementation slot at the pinned block; the static address page lists an older implementation.',
        },
        {
          name: 'ProtocolDataProvider',
          publishedCandidate: marketCandidates.publishedProtocolDataProvider,
          validatedAddress: marketCandidates.protocolDataProvider,
          resolution:
            'The static address page candidate lacks the current POOL() interface. The active address is returned by PoolAddressesProvider.getPoolDataProvider() at the pinned block and matches the official core ABI.',
        },
      ],
    },
    chain: {
      name: 'HyperEVM',
      chainId: HYPEREVM_CHAIN_ID,
      transport: 'direct JSON-RPC; runtime URL intentionally omitted',
    },
    pinnedBlock: {
      number: options.blockNumber.toString(),
      hash: block.hash,
      timestamp: block.timestamp.toString(),
    },
    contracts: Object.fromEntries(contractEntries),
    tokens: {
      underlying: {
        address: marketCandidates.usdc,
        name: underlyingToken.name,
        symbol: 'USDC',
        decimals: 6,
      },
      hToken: {
        address: marketCandidates.hToken,
        name: hToken.name,
        symbol: hToken.symbol,
        decimals: 6,
        underlyingAsset: getAddress(hTokenUnderlying),
        pool: getAddress(hTokenPool),
      },
      variableDebtToken: {
        address: marketCandidates.variableDebtToken,
        name: debtToken.name,
        symbol: debtToken.symbol,
        decimals: 6,
        underlyingAsset: getAddress(debtUnderlying),
        pool: getAddress(debtPool),
      },
    },
    oracle: {
      baseCurrency: getAddress(oracleBaseCurrency),
      baseCurrencyUnit: oracleBaseCurrencyUnit.toString(),
      usdcPrice: oraclePrice.toString(),
    },
    reserve: {
      decimals: 6,
      ltvBps: configuration[1].toString(),
      liquidationThresholdBps: configuration[2].toString(),
      liquidationBonusBps: configuration[3].toString(),
      reserveFactorBps: configuration[4].toString(),
      usageAsCollateralEnabled: configuration[5],
      borrowingEnabled: configuration[6],
      stableBorrowRateEnabled: configuration[7],
      isActive: true,
      isFrozen: configuration[9],
      physicalAvailableLiquidity: physicalAvailableLiquidity.toString(),
      virtualUnderlyingBalance: poolVirtualBalance.toString(),
      totalATokenSupply: reserveData[2].toString(),
      totalVariableDebt: reserveData[4].toString(),
      liquidityRateRay: reserveData[5].toString(),
      variableBorrowRateRay: reserveData[6].toString(),
      liquidityIndexRay: reserveData[9].toString(),
      variableBorrowIndexRay: reserveData[10].toString(),
      lastUpdateTimestamp: reserveData[11].toString(),
      deficit: poolDeficit.toString(),
    },
    checks,
  };

  return marketManifestSchema.parse(manifest);
}
