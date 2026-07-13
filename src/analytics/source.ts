import { createPublicClient, getAddress, http, type Address, type Hex } from 'viem';
import {
  addressesProviderAbi,
  erc20Abi,
  poolReadAbi,
  protocolDataProviderAbi,
  reserveTokenAbi,
} from '../protocol/abis.js';
import { EIP1967_IMPLEMENTATION_SLOT } from '../protocol/addresses.js';
import type { MarketManifest } from '../protocol/manifest.js';
import { withRpcRetry, type RetryPolicy } from '../indexer/retry.js';
import type { MarketStateSource, RawMarketState } from './types.js';

export class SnapshotValidationError extends Error {
  readonly failures: readonly string[];

  constructor(failures: readonly string[]) {
    super(`Market snapshot validation failed:\n- ${failures.join('\n- ')}`);
    this.name = 'SnapshotValidationError';
    this.failures = failures;
  }
}

export interface SnapshotRelationshipChecks {
  readonly expectedPoolImplementation: Address;
  readonly actualPoolImplementation: Address;
  readonly expectedPool: Address;
  readonly providerPool: Address;
  readonly expectedProtocolDataProvider: Address;
  readonly registryProtocolDataProvider: Address;
  readonly expectedPoolAddressesProvider: Address;
  readonly providerPoolAddressesProvider: Address;
  readonly expectedHToken: Address;
  readonly poolHToken: Address;
  readonly expectedVariableDebtToken: Address;
  readonly poolVariableDebtToken: Address;
  readonly expectedReserveDecimals: number;
  readonly reserveDecimals: bigint;
  readonly hTokenTotalSupply: bigint;
  readonly providerHTokenTotalSupply: bigint;
  readonly variableDebtTotalSupply: bigint;
  readonly providerVariableDebtTotalSupply: bigint;
  readonly poolVirtualBalance: bigint;
  readonly providerVirtualBalance: bigint;
  readonly poolDeficit: bigint;
  readonly providerDeficit: bigint;
  readonly stableBorrowingEnabled: boolean;
  readonly stableDebt: bigint;
}

export function validateSnapshotRelationships(checks: SnapshotRelationshipChecks): void {
  const failures: string[] = [];
  const equal = (
    name: string,
    expected: bigint | number | string,
    actual: bigint | number | string,
  ) => {
    if (String(expected) !== String(actual)) {
      failures.push(`${name}: expected ${String(expected)}, received ${String(actual)}`);
    }
  };

  equal('Pool implementation', checks.expectedPoolImplementation, checks.actualPoolImplementation);
  equal('ProtocolDataProvider Pool', checks.expectedPool, checks.providerPool);
  equal(
    'PoolAddressesProvider protocol data provider registry entry',
    checks.expectedProtocolDataProvider,
    checks.registryProtocolDataProvider,
  );
  equal(
    'ProtocolDataProvider addresses-provider back-reference',
    checks.expectedPoolAddressesProvider,
    checks.providerPoolAddressesProvider,
  );
  equal('Pool hToken', checks.expectedHToken, checks.poolHToken);
  equal('Pool variable-debt token', checks.expectedVariableDebtToken, checks.poolVariableDebtToken);
  equal('reserve decimals', checks.expectedReserveDecimals, checks.reserveDecimals);
  equal('hToken total supply', checks.hTokenTotalSupply, checks.providerHTokenTotalSupply);
  equal(
    'variable-debt total supply',
    checks.variableDebtTotalSupply,
    checks.providerVariableDebtTotalSupply,
  );
  equal('Pool/provider virtual balance', checks.poolVirtualBalance, checks.providerVirtualBalance);
  equal('Pool/provider deficit', checks.poolDeficit, checks.providerDeficit);
  if (checks.stableBorrowingEnabled) {
    failures.push('stable borrowing is enabled; variable-only formulas are invalid');
  }
  if (checks.stableDebt !== 0n) {
    failures.push(`stable debt is nonzero: ${checks.stableDebt.toString()}`);
  }
  if (failures.length > 0) throw new SnapshotValidationError(failures);
}

function contractAddress(manifest: MarketManifest, name: string): Address {
  const contract = manifest.contracts[name];
  if (!contract) throw new SnapshotValidationError([`manifest contract ${name} is missing`]);
  return getAddress(contract.address);
}

function storageWordToAddress(storage: Hex | undefined): Address {
  if (!storage || storage === '0x') {
    throw new SnapshotValidationError(['Pool EIP-1967 implementation storage is empty']);
  }
  return getAddress(`0x${storage.slice(-40)}`);
}

function boundedInteger(name: string, value: bigint, maximum: bigint): number {
  if (value < 0n || value > maximum) {
    throw new SnapshotValidationError([
      `${name} must be between 0 and ${maximum.toString()}, received ${value.toString()}`,
    ]);
  }
  return Number(value);
}

export interface ViemMarketStateSourceOptions {
  readonly rpcUrl: string;
  readonly retryPolicy?: RetryPolicy;
  readonly requestsPerSecond?: number;
}

export class ViemMarketStateSource implements MarketStateSource {
  private readonly client;
  private readonly retryPolicy: RetryPolicy | undefined;
  private readonly minimumRequestIntervalMs: number;
  private nextRequestAt = 0;

  constructor(options: ViemMarketStateSourceOptions) {
    this.client = createPublicClient({
      transport: http(options.rpcUrl, { retryCount: 0, timeout: 20_000 }),
    });
    this.retryPolicy = options.retryPolicy;
    const requestsPerSecond = options.requestsPerSecond ?? 30;
    if (!Number.isFinite(requestsPerSecond) || requestsPerSecond <= 0) {
      throw new RangeError('requestsPerSecond must be positive');
    }
    this.minimumRequestIntervalMs = Math.ceil(1_000 / requestsPerSecond);
  }

  private async request<T>(operation: () => Promise<T>): Promise<T> {
    const execute = async () => {
      const delay = this.nextRequestAt - Date.now();
      if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
      this.nextRequestAt = Date.now() + this.minimumRequestIntervalMs;
      return operation();
    };
    return this.retryPolicy ? withRpcRetry(execute, this.retryPolicy) : withRpcRetry(execute);
  }

  getChainId(): Promise<number> {
    return this.request(() => this.client.getChainId());
  }

  getLatestBlockNumber(): Promise<bigint> {
    return this.request(() => this.client.getBlockNumber());
  }

  async readMarketState(blockNumber: bigint, manifest: MarketManifest): Promise<RawMarketState> {
    const pool = contractAddress(manifest, 'pool');
    const expectedPoolImplementation = contractAddress(manifest, 'poolImplementation');
    const poolAddressesProvider = contractAddress(manifest, 'poolAddressesProvider');
    const protocolDataProvider = contractAddress(manifest, 'protocolDataProvider');
    const underlying = getAddress(manifest.tokens.underlying.address);
    const hToken = getAddress(manifest.tokens.hToken.address);
    const variableDebtToken = getAddress(manifest.tokens.variableDebtToken.address);

    const block = await this.request(() => this.client.getBlock({ blockNumber }));
    const implementationStorage = await this.request(() =>
      this.client.getStorageAt({
        address: pool,
        slot: EIP1967_IMPLEMENTATION_SLOT,
        blockNumber,
      }),
    );
    const poolImplementationAddress = storageWordToAddress(implementationStorage);
    const providerPool = await this.request(() =>
      this.client.readContract({
        address: protocolDataProvider,
        abi: protocolDataProviderAbi,
        functionName: 'POOL',
        blockNumber,
      }),
    );
    const registryProtocolDataProvider = await this.request(() =>
      this.client.readContract({
        address: poolAddressesProvider,
        abi: addressesProviderAbi,
        functionName: 'getPoolDataProvider',
        blockNumber,
      }),
    );
    const providerPoolAddressesProvider = await this.request(() =>
      this.client.readContract({
        address: protocolDataProvider,
        abi: protocolDataProviderAbi,
        functionName: 'ADDRESSES_PROVIDER',
        blockNumber,
      }),
    );
    const poolHToken = await this.request(() =>
      this.client.readContract({
        address: pool,
        abi: poolReadAbi,
        functionName: 'getReserveAToken',
        args: [underlying],
        blockNumber,
      }),
    );
    const poolVariableDebtToken = await this.request(() =>
      this.client.readContract({
        address: pool,
        abi: poolReadAbi,
        functionName: 'getReserveVariableDebtToken',
        args: [underlying],
        blockNumber,
      }),
    );
    const configuration = await this.request(() =>
      this.client.readContract({
        address: protocolDataProvider,
        abi: protocolDataProviderAbi,
        functionName: 'getReserveConfigurationData',
        args: [underlying],
        blockNumber,
      }),
    );
    const reserveData = await this.request(() =>
      this.client.readContract({
        address: protocolDataProvider,
        abi: protocolDataProviderAbi,
        functionName: 'getReserveData',
        args: [underlying],
        blockNumber,
      }),
    );
    const poolVirtualBalance = await this.request(() =>
      this.client.readContract({
        address: pool,
        abi: poolReadAbi,
        functionName: 'getVirtualUnderlyingBalance',
        args: [underlying],
        blockNumber,
      }),
    );
    const providerVirtualBalance = await this.request(() =>
      this.client.readContract({
        address: protocolDataProvider,
        abi: protocolDataProviderAbi,
        functionName: 'getVirtualUnderlyingBalance',
        args: [underlying],
        blockNumber,
      }),
    );
    const poolDeficit = await this.request(() =>
      this.client.readContract({
        address: pool,
        abi: poolReadAbi,
        functionName: 'getReserveDeficit',
        args: [underlying],
        blockNumber,
      }),
    );
    const providerDeficit = await this.request(() =>
      this.client.readContract({
        address: protocolDataProvider,
        abi: protocolDataProviderAbi,
        functionName: 'getReserveDeficit',
        args: [underlying],
        blockNumber,
      }),
    );
    const physicalAvailableLiquidity = await this.request(() =>
      this.client.readContract({
        address: underlying,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [hToken],
        blockNumber,
      }),
    );
    const totalHTokenSupply = await this.request(() =>
      this.client.readContract({
        address: hToken,
        abi: reserveTokenAbi,
        functionName: 'totalSupply',
        blockNumber,
      }),
    );
    const totalVariableDebt = await this.request(() =>
      this.client.readContract({
        address: variableDebtToken,
        abi: reserveTokenAbi,
        functionName: 'totalSupply',
        blockNumber,
      }),
    );

    validateSnapshotRelationships({
      expectedPoolImplementation,
      actualPoolImplementation: poolImplementationAddress,
      expectedPool: pool,
      providerPool: getAddress(providerPool),
      expectedProtocolDataProvider: protocolDataProvider,
      registryProtocolDataProvider: getAddress(registryProtocolDataProvider),
      expectedPoolAddressesProvider: poolAddressesProvider,
      providerPoolAddressesProvider: getAddress(providerPoolAddressesProvider),
      expectedHToken: hToken,
      poolHToken: getAddress(poolHToken),
      expectedVariableDebtToken: variableDebtToken,
      poolVariableDebtToken: getAddress(poolVariableDebtToken),
      expectedReserveDecimals: manifest.reserve.decimals,
      reserveDecimals: configuration[0],
      hTokenTotalSupply: totalHTokenSupply,
      providerHTokenTotalSupply: reserveData[2],
      variableDebtTotalSupply: totalVariableDebt,
      providerVariableDebtTotalSupply: reserveData[4],
      poolVirtualBalance,
      providerVirtualBalance,
      poolDeficit,
      providerDeficit,
      stableBorrowingEnabled: configuration[7],
      stableDebt: reserveData[3],
    });

    return {
      block: { number: block.number, hash: block.hash, timestamp: block.timestamp },
      poolImplementationAddress,
      physicalAvailableLiquidityBaseUnits: physicalAvailableLiquidity,
      virtualUnderlyingBalanceBaseUnits: poolVirtualBalance,
      totalHTokenSupplyBaseUnits: totalHTokenSupply,
      totalVariableDebtBaseUnits: totalVariableDebt,
      totalStableDebtBaseUnits: reserveData[3],
      unbackedBaseUnits: reserveData[0],
      accruedToTreasuryScaledBaseUnits: reserveData[1],
      deficitBaseUnits: poolDeficit,
      liquidityRateRay: reserveData[5],
      variableBorrowRateRay: reserveData[6],
      liquidityIndexRay: reserveData[9],
      variableBorrowIndexRay: reserveData[10],
      reserveLastUpdateTimestamp: BigInt(reserveData[11]),
      reserveFactorBps: boundedInteger('reserveFactorBps', configuration[4], 10_000n),
      borrowingEnabled: configuration[6],
      stableBorrowRateEnabled: configuration[7],
      isActive: configuration[8],
      isFrozen: configuration[9],
    };
  }
}
