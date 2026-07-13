import type {
  BlockRange,
  IndexerCheckpoint,
  IndexerStore,
  IngestionFailure,
  PersistRangeInput,
  PersistRangeResult,
  PreparedMarketLog,
  RunCounters,
  RunMetadata,
} from './types.js';

interface MemoryRun {
  readonly metadata: RunMetadata;
  status: 'running' | 'completed' | 'failed';
  counters: RunCounters;
  failure?: IngestionFailure;
}

const zeroCounters = (): RunCounters => ({
  rangesCompleted: 0,
  logsFetched: 0,
  decodedCount: 0,
  filteredCount: 0,
  insertedCount: 0,
  duplicateCount: 0,
});

export class MemoryIndexerStore implements IndexerStore {
  readonly checkpoints = new Map<string, IndexerCheckpoint>();
  readonly records = new Map<string, PreparedMarketLog>();
  readonly runs = new Map<number, MemoryRun>();
  readonly failures: { runId: number; range: BlockRange; failure: IngestionFailure }[] = [];
  private nextRunId = 1;

  getCheckpoint(checkpointKey: string): Promise<IndexerCheckpoint | undefined> {
    return Promise.resolve(this.checkpoints.get(checkpointKey));
  }

  startRun(metadata: RunMetadata): Promise<number> {
    for (const run of this.runs.values()) {
      if (run.metadata.checkpointKey === metadata.checkpointKey && run.status === 'running') {
        run.status = 'failed';
        run.failure = {
          classification: 'unknown',
          retryable: false,
          attempts: 1,
          message: 'superseded by a resumed run after an unclean stop',
        };
      }
    }
    const runId = this.nextRunId;
    this.nextRunId += 1;
    this.runs.set(runId, { metadata, status: 'running', counters: zeroCounters() });
    return Promise.resolve(runId);
  }

  persistRange(input: PersistRangeInput): Promise<PersistRangeResult> {
    let insertedCount = 0;
    let duplicateCount = 0;
    for (const record of input.records) {
      const key = `${input.chainId}:${record.log.transactionHash}:${record.log.logIndex}`;
      const existing = this.records.get(key);
      if (existing) {
        if (
          existing.log.blockHash !== record.log.blockHash ||
          existing.log.data !== record.log.data ||
          JSON.stringify(existing.log.topics) !== JSON.stringify(record.log.topics)
        ) {
          throw new Error(`raw log identity conflict at ${key}`);
        }
        duplicateCount += 1;
      } else {
        this.records.set(key, record);
        insertedCount += 1;
      }
    }
    this.checkpoints.set(input.checkpointKey, {
      checkpointKey: input.checkpointKey,
      manifestId: input.manifestId,
      chainId: input.chainId,
      nextBlock: input.range.toBlock + 1n,
      finalizedBlockNumber: input.checkpointBlock.number,
      finalizedBlockHash: input.checkpointBlock.hash,
      confirmationLag: input.confirmationLag,
    });
    const run = this.runs.get(input.runId);
    if (!run) throw new Error(`unknown run ${input.runId}`);
    run.counters = {
      rangesCompleted: run.counters.rangesCompleted + 1,
      logsFetched: run.counters.logsFetched + input.logsFetched,
      decodedCount: run.counters.decodedCount + input.decodedCount,
      filteredCount: run.counters.filteredCount + input.filteredCount,
      insertedCount: run.counters.insertedCount + insertedCount,
      duplicateCount: run.counters.duplicateCount + duplicateCount,
    };
    return Promise.resolve({ insertedCount, duplicateCount });
  }

  completeRun(runId: number): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`unknown run ${runId}`);
    run.status = 'completed';
    return Promise.resolve();
  }

  failRun(runId: number, range: BlockRange, failure: IngestionFailure): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`unknown run ${runId}`);
    run.status = 'failed';
    run.failure = failure;
    this.failures.push({ runId, range, failure });
    return Promise.resolve();
  }
}
