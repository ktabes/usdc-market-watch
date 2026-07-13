import type { Hex } from 'viem';
import type { DatabaseClient } from '../db/client.js';
import { eventToColumns, DECODER_VERSION } from './normalize.js';
import type {
  BlockRange,
  IndexerCheckpoint,
  IndexerStore,
  IngestionFailure,
  PersistRangeInput,
  PersistRangeResult,
  RunMetadata,
} from './types.js';

interface CheckpointRow {
  checkpoint_key: string;
  manifest_id: string;
  chain_id: number;
  next_block: string;
  finalized_block_number: string;
  finalized_block_hash: Hex;
  confirmation_lag: number;
}

export class BlockHashConflictError extends Error {
  constructor(blockNumber: bigint, expected: string, actual: string) {
    super(`block ${blockNumber} hash conflict: stored ${expected}, received ${actual}`);
    this.name = 'BlockHashConflictError';
  }
}

export class RawLogConflictError extends Error {
  constructor(transactionHash: string, logIndex: number) {
    super(`raw log identity conflict at ${transactionHash}:${logIndex}`);
    this.name = 'RawLogConflictError';
  }
}

function serializeJsonb(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError('cannot serialize undefined as JSONB');
  return serialized;
}

export class PostgresIndexerStore implements IndexerStore {
  constructor(private readonly sql: DatabaseClient) {}

  async getCheckpoint(checkpointKey: string): Promise<IndexerCheckpoint | undefined> {
    const rows = await this.sql<CheckpointRow[]>`
      select checkpoint_key, manifest_id, chain_id, next_block, finalized_block_number,
             finalized_block_hash, confirmation_lag
      from indexer_checkpoints
      where checkpoint_key = ${checkpointKey}
    `;
    const row = rows[0];
    if (!row) return undefined;
    return {
      checkpointKey: row.checkpoint_key,
      manifestId: row.manifest_id,
      chainId: row.chain_id,
      nextBlock: BigInt(row.next_block),
      finalizedBlockNumber: BigInt(row.finalized_block_number),
      finalizedBlockHash: row.finalized_block_hash,
      confirmationLag: row.confirmation_lag,
    };
  }

  async startRun(metadata: RunMetadata): Promise<number> {
    return this.sql.begin(async (transaction) => {
      await transaction`
        update indexer_runs set
          status = 'failed', failure_count = failure_count + 1,
          failure_detail = 'superseded by a resumed run after an unclean stop',
          finished_at = now()
        where checkpoint_key = ${metadata.checkpointKey} and status = 'running'
      `;
      const rows = await transaction<{ id: string | number }[]>`
        insert into indexer_runs (
          command, checkpoint_key, manifest_id, chain_id, requested_from_block,
          requested_to_block, finalized_head_block, status
        ) values (
          ${metadata.command}, ${metadata.checkpointKey}, ${metadata.manifestId},
          ${metadata.chainId}, ${metadata.requestedFromBlock.toString()},
          ${metadata.requestedToBlock.toString()}, ${metadata.finalizedHeadBlock.toString()}, 'running'
        )
        returning id
      `;
      const id = rows[0]?.id;
      if (id === undefined) throw new Error('failed to create indexer run');
      return Number(id);
    });
  }

  async persistRange(input: PersistRangeInput): Promise<PersistRangeResult> {
    return this.sql.begin(async (transaction) => {
      const blocks = new Map(
        [...input.records.map((record) => record.block), input.checkpointBlock].map((block) => [
          block.number,
          block,
        ]),
      );
      for (const block of blocks.values()) {
        const existing = await transaction<{ block_hash: string }[]>`
          select block_hash from blocks
          where chain_id = ${input.chainId} and block_number = ${block.number.toString()}
        `;
        if (existing[0] && existing[0].block_hash !== block.hash) {
          throw new BlockHashConflictError(block.number, existing[0].block_hash, block.hash);
        }
        await transaction`
          insert into blocks (chain_id, block_number, block_hash, block_timestamp)
          values (
            ${input.chainId}, ${block.number.toString()}, ${block.hash},
            ${block.timestamp.toString()}
          )
          on conflict (chain_id, block_number) do nothing
        `;
      }

      let insertedCount = 0;
      let duplicateCount = 0;
      for (const record of input.records) {
        const topicsJson = serializeJsonb([...record.log.topics]);
        const decodedPayloadJson = serializeJsonb(record.decodedPayload);
        const inserted = await transaction<{ id: string | number }[]>`
          insert into raw_logs (
            chain_id, block_number, block_hash, block_timestamp, transaction_hash,
            transaction_index, log_index, contract_address, topics, data,
            decoded_event_name, decoded_payload, decoder_version, source_run_id
          ) values (
            ${input.chainId}, ${record.log.blockNumber.toString()}, ${record.log.blockHash},
            ${record.block.timestamp.toString()}, ${record.log.transactionHash},
            ${record.log.transactionIndex}, ${record.log.logIndex}, ${record.log.address},
            ${topicsJson}::jsonb, ${record.log.data},
            ${record.event.eventType}, ${decodedPayloadJson}::jsonb,
            ${DECODER_VERSION}, ${input.runId}
          )
          on conflict (chain_id, transaction_hash, log_index) do nothing
          returning id
        `;
        const insertedId = inserted[0]?.id;
        if (insertedId === undefined) {
          const existing = await transaction<
            {
              block_hash: string;
              contract_address: string;
              data: string;
              topics_match: boolean;
              payload_match: boolean;
            }[]
          >`
            select block_hash, contract_address, data,
                   topics = ${topicsJson}::jsonb as topics_match,
                   decoded_payload = ${decodedPayloadJson}::jsonb as payload_match
            from raw_logs
            where chain_id = ${input.chainId}
              and transaction_hash = ${record.log.transactionHash}
              and log_index = ${record.log.logIndex}
          `;
          const found = existing[0];
          if (
            !found ||
            found.block_hash !== record.log.blockHash ||
            found.contract_address !== record.log.address ||
            found.data !== record.log.data ||
            !found.topics_match ||
            !found.payload_match
          ) {
            throw new RawLogConflictError(record.log.transactionHash, record.log.logIndex);
          }
          duplicateCount += 1;
          continue;
        }

        const columns = eventToColumns(record.event);
        await transaction`
          insert into market_events (
            raw_log_id, event_type, reserve, collateral_asset, debt_asset, user_address,
            on_behalf_of, counterparty, amount_base_units, debt_to_cover_base_units,
            liquidated_collateral_base_units, borrow_rate_ray, interest_rate_mode,
            referral_code, use_atokens, receive_atoken
          ) values (
            ${Number(insertedId)}, ${columns.eventType}, ${columns.reserve},
            ${columns.collateralAsset}, ${columns.debtAsset}, ${columns.userAddress},
            ${columns.onBehalfOf}, ${columns.counterparty},
            ${columns.amountBaseUnits?.toString() ?? null},
            ${columns.debtToCoverBaseUnits?.toString() ?? null},
            ${columns.liquidatedCollateralBaseUnits?.toString() ?? null},
            ${columns.borrowRateRay?.toString() ?? null}, ${columns.interestRateMode},
            ${columns.referralCode},
            ${columns.useATokens}, ${columns.receiveAToken}
          )
        `;
        insertedCount += 1;
      }

      await transaction`
        insert into indexer_checkpoints (
          checkpoint_key, manifest_id, chain_id, next_block, finalized_block_number,
          finalized_block_hash, confirmation_lag, updated_at
        ) values (
          ${input.checkpointKey}, ${input.manifestId}, ${input.chainId},
          ${(input.range.toBlock + 1n).toString()}, ${input.checkpointBlock.number.toString()},
          ${input.checkpointBlock.hash}, ${input.confirmationLag}, now()
        )
        on conflict (checkpoint_key) do update set
          manifest_id = excluded.manifest_id,
          chain_id = excluded.chain_id,
          next_block = excluded.next_block,
          finalized_block_number = excluded.finalized_block_number,
          finalized_block_hash = excluded.finalized_block_hash,
          confirmation_lag = excluded.confirmation_lag,
          updated_at = now()
        where indexer_checkpoints.next_block <= excluded.next_block
      `;

      await transaction`
        update indexer_runs set
          ranges_completed = ranges_completed + 1,
          logs_fetched = logs_fetched + ${input.logsFetched},
          decoded_count = decoded_count + ${input.decodedCount},
          filtered_count = filtered_count + ${input.filteredCount},
          inserted_count = inserted_count + ${insertedCount},
          duplicate_count = duplicate_count + ${duplicateCount}
        where id = ${input.runId}
      `;

      return { insertedCount, duplicateCount };
    });
  }

  async completeRun(runId: number): Promise<void> {
    await this.sql`
      update indexer_runs set status = 'completed', finished_at = now()
      where id = ${runId}
    `;
  }

  async failRun(runId: number, range: BlockRange, failure: IngestionFailure): Promise<void> {
    await this.sql.begin(async (transaction) => {
      await transaction`
        insert into ingestion_failures (
          run_id, from_block, to_block, classification, retryable, attempts, message
        ) values (
          ${runId}, ${range.fromBlock.toString()}, ${range.toBlock.toString()},
          ${failure.classification},
          ${failure.retryable}, ${failure.attempts}, ${failure.message}
        )
      `;
      await transaction`
        update indexer_runs set
          status = 'failed', failure_count = failure_count + 1,
          failure_detail = ${failure.message}, finished_at = now()
        where id = ${runId}
      `;
    });
  }
}
