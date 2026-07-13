import { getAddress } from 'viem';
import type { MarketManifest } from '../protocol/manifest.js';
import { decodeAndFilterMarketLogs, DECODER_VERSION } from './normalize.js';
import { planLogRanges } from './ranges.js';
import { classifyRpcError, RpcOperationError } from './retry.js';
import { assertIndexerChainId } from './source.js';
import type {
  BlockRange,
  ChainBlock,
  ChainSource,
  IndexerCheckpoint,
  IndexerStore,
  IndexingReport,
  IngestionFailure,
  RunCounters,
} from './types.js';

interface CommonIndexingOptions {
  readonly source: ChainSource;
  readonly store: IndexerStore;
  readonly manifest: MarketManifest;
  readonly confirmationLag: number;
  readonly chunkSize: bigint;
}

export interface BackfillOptions extends CommonIndexingOptions {
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
}

export type SyncOptions = CommonIndexingOptions;

export class FinalityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FinalityError';
  }
}

export class CheckpointValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckpointValidationError';
  }
}

const zeroCounters = (): RunCounters => ({
  rangesCompleted: 0,
  logsFetched: 0,
  decodedCount: 0,
  filteredCount: 0,
  insertedCount: 0,
  duplicateCount: 0,
});

function addCounters(left: RunCounters, right: RunCounters): RunCounters {
  return {
    rangesCompleted: left.rangesCompleted + right.rangesCompleted,
    logsFetched: left.logsFetched + right.logsFetched,
    decodedCount: left.decodedCount + right.decodedCount,
    filteredCount: left.filteredCount + right.filteredCount,
    insertedCount: left.insertedCount + right.insertedCount,
    duplicateCount: left.duplicateCount + right.duplicateCount,
  };
}

async function finalizedHead(source: ChainSource, confirmationLag: number): Promise<bigint> {
  if (!Number.isSafeInteger(confirmationLag) || confirmationLag < 0) {
    throw new RangeError('confirmationLag must be a non-negative safe integer');
  }
  const latest = await source.getLatestBlockNumber();
  const lag = BigInt(confirmationLag);
  if (latest < lag)
    throw new FinalityError('latest block is below the configured confirmation lag');
  return latest - lag;
}

async function validateCheckpoint(
  source: ChainSource,
  checkpoint: IndexerCheckpoint,
  manifest: MarketManifest,
  confirmationLag: number,
): Promise<void> {
  if (checkpoint.manifestId !== manifest.manifestId) {
    throw new CheckpointValidationError('checkpoint manifest does not match the active manifest');
  }
  if (checkpoint.chainId !== manifest.chain.chainId) {
    throw new CheckpointValidationError('checkpoint chain does not match the active manifest');
  }
  if (checkpoint.confirmationLag !== confirmationLag) {
    throw new CheckpointValidationError(
      `checkpoint confirmation lag ${checkpoint.confirmationLag} does not match ${confirmationLag}`,
    );
  }
  const block = await source.getBlock(checkpoint.finalizedBlockNumber);
  if (block.hash !== checkpoint.finalizedBlockHash) {
    throw new CheckpointValidationError(
      `checkpoint hash mismatch at block ${checkpoint.finalizedBlockNumber}`,
    );
  }
}

async function loadBlocksForRange(
  source: ChainSource,
  range: BlockRange,
  eventBlocks: readonly bigint[],
): Promise<ReadonlyMap<bigint, ChainBlock>> {
  const numbers = [...new Set([...eventBlocks, range.toBlock])].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const blocks = new Map<bigint, ChainBlock>();
  for (const number of numbers) blocks.set(number, await source.getBlock(number));
  return blocks;
}

function failureFrom(error: unknown): IngestionFailure {
  if (error instanceof RpcOperationError) {
    return {
      classification: error.classification,
      retryable: error.retryable,
      attempts: error.attempts,
      message: error.message,
    };
  }
  return { ...classifyRpcError(error), attempts: 1 };
}

async function executeRanges(input: {
  readonly command: 'backfill' | 'sync';
  readonly checkpointKey: string;
  readonly requestedFromBlock: bigint;
  readonly requestedToBlock: bigint;
  readonly finalizedHeadBlock: bigint;
  readonly startBlock: bigint;
  readonly options: CommonIndexingOptions;
}): Promise<IndexingReport> {
  const base = {
    command: input.command,
    checkpointKey: input.checkpointKey,
    requestedFromBlock: input.requestedFromBlock,
    requestedToBlock: input.requestedToBlock,
    finalizedHeadBlock: input.finalizedHeadBlock,
  } as const;
  if (input.startBlock > input.requestedToBlock) {
    return { ...base, ...zeroCounters(), noOp: true };
  }

  const runId = await input.options.store.startRun({
    command: input.command,
    checkpointKey: input.checkpointKey,
    manifestId: input.options.manifest.manifestId,
    chainId: input.options.manifest.chain.chainId,
    requestedFromBlock: input.requestedFromBlock,
    requestedToBlock: input.requestedToBlock,
    finalizedHeadBlock: input.finalizedHeadBlock,
  });
  let totals = zeroCounters();

  for (const range of planLogRanges(
    input.startBlock,
    input.requestedToBlock,
    input.options.chunkSize,
  )) {
    try {
      const logs = await input.options.source.getMarketLogs(range);
      const blocks = await loadBlocksForRange(
        input.options.source,
        range,
        logs.map((log) => log.blockNumber),
      );
      const decoded = decodeAndFilterMarketLogs(
        logs,
        blocks,
        getAddress(input.options.manifest.tokens.underlying.address),
      );
      const checkpointBlock = blocks.get(range.toBlock);
      if (!checkpointBlock) throw new Error(`missing checkpoint block ${range.toBlock}`);
      const persisted = await input.options.store.persistRange({
        runId,
        chainId: input.options.manifest.chain.chainId,
        manifestId: input.options.manifest.manifestId,
        checkpointKey: input.checkpointKey,
        confirmationLag: input.options.confirmationLag,
        range,
        checkpointBlock,
        records: decoded.records,
        logsFetched: logs.length,
        decodedCount: decoded.decodedCount,
        filteredCount: decoded.filteredCount,
      });
      const counters: RunCounters = {
        rangesCompleted: 1,
        logsFetched: logs.length,
        decodedCount: decoded.decodedCount,
        filteredCount: decoded.filteredCount,
        insertedCount: persisted.insertedCount,
        duplicateCount: persisted.duplicateCount,
      };
      totals = addCounters(totals, counters);
    } catch (error) {
      await input.options.store.failRun(runId, range, failureFrom(error));
      throw error;
    }
  }

  await input.options.store.completeRun(runId);
  return { ...base, ...totals, noOp: false, runId };
}

async function validateSource(options: CommonIndexingOptions): Promise<bigint> {
  assertIndexerChainId(await options.source.getChainId());
  if (options.manifest.chain.chainId !== 999) throw new Error('manifest chain is not HyperEVM');
  if (options.manifest.abiVersion !== DECODER_VERSION) {
    throw new Error(
      `manifest ABI ${options.manifest.abiVersion} does not match decoder ${DECODER_VERSION}`,
    );
  }
  return finalizedHead(options.source, options.confirmationLag);
}

export async function backfill(options: BackfillOptions): Promise<IndexingReport> {
  if (options.fromBlock < 0n || options.toBlock < options.fromBlock) {
    throw new RangeError('backfill requires 0 <= fromBlock <= toBlock');
  }
  const head = await validateSource(options);
  if (options.toBlock > head) {
    throw new FinalityError(
      `requested end block ${options.toBlock} exceeds finalized head ${head}`,
    );
  }
  const checkpointKey = `backfill:${options.manifest.manifestId}:${options.fromBlock}:${options.toBlock}`;
  const checkpoint = await options.store.getCheckpoint(checkpointKey);
  if (checkpoint) await validateCheckpoint(options.source, checkpoint, options.manifest, 0);
  return executeRanges({
    command: 'backfill',
    checkpointKey,
    requestedFromBlock: options.fromBlock,
    requestedToBlock: options.toBlock,
    finalizedHeadBlock: head,
    startBlock: checkpoint?.nextBlock ?? options.fromBlock,
    options: { ...options, confirmationLag: 0 },
  });
}

export async function sync(options: SyncOptions): Promise<IndexingReport> {
  const head = await validateSource(options);
  const checkpointKey = `sync:${options.manifest.manifestId}`;
  const checkpoint = await options.store.getCheckpoint(checkpointKey);
  if (checkpoint) {
    await validateCheckpoint(options.source, checkpoint, options.manifest, options.confirmationLag);
  }
  const initialBlock = BigInt(options.manifest.pinnedBlock.number) + 1n;
  const startBlock = checkpoint?.nextBlock ?? initialBlock;
  return executeRanges({
    command: 'sync',
    checkpointKey,
    requestedFromBlock: startBlock,
    requestedToBlock: head,
    finalizedHeadBlock: head,
    startBlock,
    options,
  });
}

export function indexingReportToJson(report: IndexingReport): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(report, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  ) as Record<string, unknown>;
}
