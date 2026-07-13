import type { Address, Hex } from 'viem';
import type { NormalizedMarketEvent } from '../protocol/events.js';

export interface BlockRange {
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
}

export interface ChainBlock {
  readonly number: bigint;
  readonly hash: Hex;
  readonly timestamp: bigint;
}

export interface ChainLog {
  readonly blockNumber: bigint;
  readonly blockHash: Hex;
  readonly transactionHash: Hex;
  readonly transactionIndex: number;
  readonly logIndex: number;
  readonly address: Address;
  readonly topics: readonly Hex[];
  readonly data: Hex;
}

export interface ChainSource {
  getChainId(): Promise<number>;
  getLatestBlockNumber(): Promise<bigint>;
  getBlock(blockNumber: bigint): Promise<ChainBlock>;
  getMarketLogs(range: BlockRange): Promise<readonly ChainLog[]>;
}

export interface IndexerCheckpoint {
  readonly checkpointKey: string;
  readonly manifestId: string;
  readonly chainId: number;
  readonly nextBlock: bigint;
  readonly finalizedBlockNumber: bigint;
  readonly finalizedBlockHash: Hex;
  readonly confirmationLag: number;
}

export interface PreparedMarketLog {
  readonly log: ChainLog;
  readonly block: ChainBlock;
  readonly event: NormalizedMarketEvent;
  readonly decodedPayload: Record<string, unknown>;
}

export interface RunMetadata {
  readonly command: 'backfill' | 'sync';
  readonly checkpointKey: string;
  readonly manifestId: string;
  readonly chainId: number;
  readonly requestedFromBlock: bigint;
  readonly requestedToBlock: bigint;
  readonly finalizedHeadBlock: bigint;
}

export interface RunCounters {
  readonly rangesCompleted: number;
  readonly logsFetched: number;
  readonly decodedCount: number;
  readonly filteredCount: number;
  readonly insertedCount: number;
  readonly duplicateCount: number;
}

export interface PersistRangeInput {
  readonly runId: number;
  readonly chainId: number;
  readonly manifestId: string;
  readonly checkpointKey: string;
  readonly confirmationLag: number;
  readonly range: BlockRange;
  readonly checkpointBlock: ChainBlock;
  readonly records: readonly PreparedMarketLog[];
  readonly logsFetched: number;
  readonly decodedCount: number;
  readonly filteredCount: number;
}

export interface PersistRangeResult {
  readonly insertedCount: number;
  readonly duplicateCount: number;
}

export type RpcFailureClassification =
  'rate_limit' | 'timeout' | 'network' | 'server' | 'invalid_request' | 'range_limit' | 'unknown';

export interface IngestionFailure {
  readonly classification: RpcFailureClassification;
  readonly retryable: boolean;
  readonly attempts: number;
  readonly message: string;
}

export interface IndexerStore {
  getCheckpoint(checkpointKey: string): Promise<IndexerCheckpoint | undefined>;
  startRun(metadata: RunMetadata): Promise<number>;
  persistRange(input: PersistRangeInput): Promise<PersistRangeResult>;
  completeRun(runId: number): Promise<void>;
  failRun(runId: number, range: BlockRange, failure: IngestionFailure): Promise<void>;
}

export interface IndexingReport extends RunCounters {
  readonly command: 'backfill' | 'sync';
  readonly checkpointKey: string;
  readonly requestedFromBlock: bigint;
  readonly requestedToBlock: bigint;
  readonly finalizedHeadBlock: bigint;
  readonly noOp: boolean;
  readonly runId?: number;
}
