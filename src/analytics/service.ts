import { getAddress } from 'viem';
import { ABI_VERSION } from '../protocol/abis.js';
import type { MarketManifest } from '../protocol/manifest.js';
import { assertIndexerChainId } from '../indexer/source.js';
import { buildMarketSnapshot, CALCULATION_VERSION } from './math.js';
import type {
  AnalyticsStore,
  HourlyFlowAggregate,
  MarketSnapshot,
  MarketStateSource,
  RebuildFlowsResult,
  SnapshotReport,
} from './types.js';

function manifestContract(manifest: MarketManifest, name: string) {
  const contract = manifest.contracts[name];
  if (!contract) throw new Error(`committed manifest is missing ${name}`);
  return getAddress(contract.address);
}

function assertManifestAbi(manifest: MarketManifest): void {
  if (manifest.abiVersion !== ABI_VERSION) {
    throw new Error(
      `manifest ABI version ${manifest.abiVersion} does not match runtime ${ABI_VERSION}`,
    );
  }
}

export async function createMarketSnapshot(input: {
  readonly source: MarketStateSource;
  readonly store: AnalyticsStore;
  readonly manifest: MarketManifest;
  readonly blockNumber: bigint;
  readonly confirmationLag: number;
}): Promise<SnapshotReport> {
  if (input.blockNumber < 1n) throw new RangeError('snapshot block must be positive');
  if (!Number.isSafeInteger(input.confirmationLag) || input.confirmationLag < 0) {
    throw new RangeError('confirmation lag must be a non-negative safe integer');
  }
  assertManifestAbi(input.manifest);
  const chainId = await input.source.getChainId();
  assertIndexerChainId(chainId);
  if (chainId !== input.manifest.chain.chainId) {
    throw new Error(
      `manifest chain ${input.manifest.chain.chainId} does not match source chain ${chainId}`,
    );
  }
  const latestBlock = await input.source.getLatestBlockNumber();
  const finalizedHead = latestBlock - BigInt(input.confirmationLag);
  if (input.blockNumber > finalizedHead) {
    throw new Error(
      `snapshot block ${input.blockNumber.toString()} exceeds finalized head ${finalizedHead.toString()}`,
    );
  }

  const state = await input.source.readMarketState(input.blockNumber, input.manifest);
  if (state.block.number !== input.blockNumber) {
    throw new Error(
      `snapshot source returned block ${state.block.number.toString()} for requested ${input.blockNumber.toString()}`,
    );
  }
  const snapshot = buildMarketSnapshot({
    chainId,
    manifestId: input.manifest.manifestId,
    abiVersion: input.manifest.abiVersion,
    poolAddress: manifestContract(input.manifest, 'pool'),
    protocolDataProviderAddress: manifestContract(input.manifest, 'protocolDataProvider'),
    underlyingAddress: getAddress(input.manifest.tokens.underlying.address),
    hTokenAddress: getAddress(input.manifest.tokens.hToken.address),
    variableDebtTokenAddress: getAddress(input.manifest.tokens.variableDebtToken.address),
    state,
  });
  const status = await input.store.persistSnapshot(snapshot);
  return { blockNumber: state.block.number, blockHash: state.block.hash, status, snapshot };
}

export function rebuildHourlyFlows(input: {
  readonly store: AnalyticsStore;
  readonly manifest: MarketManifest;
}): Promise<RebuildFlowsResult> {
  assertManifestAbi(input.manifest);
  return input.store.rebuildHourlyFlows({
    chainId: input.manifest.chain.chainId,
    manifestId: input.manifest.manifestId,
    underlyingAddress: getAddress(input.manifest.tokens.underlying.address),
    calculationVersion: CALCULATION_VERSION,
  });
}

export function getCurrentState(input: {
  readonly store: AnalyticsStore;
  readonly manifest: MarketManifest;
}): Promise<MarketSnapshot | undefined> {
  return input.store.getLatestSnapshot({
    chainId: input.manifest.chain.chainId,
    manifestId: input.manifest.manifestId,
    calculationVersion: CALCULATION_VERSION,
  });
}

export function getFlows(input: {
  readonly store: AnalyticsStore;
  readonly manifest: MarketManifest;
  readonly fromTimestamp: bigint;
  readonly toTimestamp: bigint;
}): Promise<readonly HourlyFlowAggregate[]> {
  if (input.fromTimestamp < 0n || input.toTimestamp < input.fromTimestamp) {
    throw new RangeError('flow timestamp range is invalid');
  }
  return input.store.getHourlyFlows({
    chainId: input.manifest.chain.chainId,
    manifestId: input.manifest.manifestId,
    calculationVersion: CALCULATION_VERSION,
    fromTimestamp: input.fromTimestamp,
    toTimestamp: input.toTimestamp,
  });
}

export function exactJson(value: unknown): unknown {
  if (value === undefined) return null;
  return JSON.parse(
    JSON.stringify(value, (_key, entry: unknown) =>
      typeof entry === 'bigint' ? entry.toString() : entry,
    ),
  ) as unknown;
}
