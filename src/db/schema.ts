import {
  bigserial,
  bigint,
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { check } from 'drizzle-orm/pg-core';

/**
 * Phase 0 bootstrap metadata only. Domain tables are deliberately deferred to later phases.
 */
export const systemMetadata = pgTable('system_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

const blockNumber = (name: string) => numeric(name, { precision: 78, scale: 0, mode: 'bigint' });
const uint256 = (name: string) => numeric(name, { precision: 78, scale: 0, mode: 'bigint' });

export const blocks = pgTable(
  'blocks',
  {
    chainId: integer('chain_id').notNull(),
    blockNumber: blockNumber('block_number').notNull(),
    blockHash: text('block_hash').notNull(),
    blockTimestamp: blockNumber('block_timestamp').notNull(),
    insertedAt: timestamp('inserted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.chainId, table.blockNumber] }),
    check('blocks_chain_positive', sql`${table.chainId} > 0`),
    check('blocks_number_nonnegative', sql`${table.blockNumber} >= 0`),
  ],
);

export const indexerRuns = pgTable(
  'indexer_runs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    command: text('command').notNull(),
    checkpointKey: text('checkpoint_key').notNull(),
    manifestId: text('manifest_id').notNull(),
    chainId: integer('chain_id').notNull(),
    requestedFromBlock: blockNumber('requested_from_block').notNull(),
    requestedToBlock: blockNumber('requested_to_block').notNull(),
    finalizedHeadBlock: blockNumber('finalized_head_block').notNull(),
    status: text('status').notNull(),
    rangesCompleted: integer('ranges_completed').notNull().default(0),
    logsFetched: integer('logs_fetched').notNull().default(0),
    decodedCount: integer('decoded_count').notNull().default(0),
    filteredCount: integer('filtered_count').notNull().default(0),
    insertedCount: integer('inserted_count').notNull().default(0),
    duplicateCount: integer('duplicate_count').notNull().default(0),
    failureCount: integer('failure_count').notNull().default(0),
    failureDetail: text('failure_detail'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    check('indexer_runs_command_valid', sql`${table.command} in ('backfill', 'sync')`),
    check('indexer_runs_status_valid', sql`${table.status} in ('running', 'completed', 'failed')`),
    check(
      'indexer_runs_counters_nonnegative',
      sql`${table.rangesCompleted} >= 0 and ${table.logsFetched} >= 0 and
          ${table.decodedCount} >= 0 and ${table.filteredCount} >= 0 and
          ${table.insertedCount} >= 0 and ${table.duplicateCount} >= 0 and
          ${table.failureCount} >= 0`,
    ),
  ],
);

export const rawLogs = pgTable(
  'raw_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    chainId: integer('chain_id').notNull(),
    blockNumber: blockNumber('block_number').notNull(),
    blockHash: text('block_hash').notNull(),
    blockTimestamp: blockNumber('block_timestamp').notNull(),
    transactionHash: text('transaction_hash').notNull(),
    transactionIndex: integer('transaction_index').notNull(),
    logIndex: integer('log_index').notNull(),
    contractAddress: text('contract_address').notNull(),
    topics: jsonb('topics').$type<string[]>().notNull(),
    data: text('data').notNull(),
    decodedEventName: text('decoded_event_name').notNull(),
    decodedPayload: jsonb('decoded_payload').$type<Record<string, unknown>>().notNull(),
    decoderVersion: text('decoder_version').notNull(),
    sourceRunId: bigint('source_run_id', { mode: 'number' })
      .notNull()
      .references(() => indexerRuns.id),
    insertedAt: timestamp('inserted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('raw_logs_chain_transaction_log_unique').on(
      table.chainId,
      table.transactionHash,
      table.logIndex,
    ),
    check(
      'raw_logs_indexes_nonnegative',
      sql`${table.transactionIndex} >= 0 and ${table.logIndex} >= 0`,
    ),
  ],
);

export const marketEvents = pgTable(
  'market_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    rawLogId: bigint('raw_log_id', { mode: 'number' })
      .notNull()
      .references(() => rawLogs.id),
    eventType: text('event_type').notNull(),
    reserve: text('reserve'),
    collateralAsset: text('collateral_asset'),
    debtAsset: text('debt_asset'),
    userAddress: text('user_address').notNull(),
    onBehalfOf: text('on_behalf_of'),
    counterparty: text('counterparty'),
    amountBaseUnits: uint256('amount_base_units'),
    debtToCoverBaseUnits: uint256('debt_to_cover_base_units'),
    liquidatedCollateralBaseUnits: uint256('liquidated_collateral_base_units'),
    borrowRateRay: uint256('borrow_rate_ray'),
    interestRateMode: integer('interest_rate_mode'),
    referralCode: integer('referral_code'),
    useATokens: boolean('use_atokens'),
    receiveAToken: boolean('receive_atoken'),
    insertedAt: timestamp('inserted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('market_events_raw_log_unique').on(table.rawLogId),
    check(
      'market_events_type_valid',
      sql`${table.eventType} in ('Supply', 'Withdraw', 'Borrow', 'Repay', 'LiquidationCall')`,
    ),
  ],
);

export const indexerCheckpoints = pgTable(
  'indexer_checkpoints',
  {
    checkpointKey: text('checkpoint_key').primaryKey(),
    manifestId: text('manifest_id').notNull(),
    chainId: integer('chain_id').notNull(),
    nextBlock: blockNumber('next_block').notNull(),
    finalizedBlockNumber: blockNumber('finalized_block_number').notNull(),
    finalizedBlockHash: text('finalized_block_hash').notNull(),
    confirmationLag: integer('confirmation_lag').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('indexer_checkpoints_lag_nonnegative', sql`${table.confirmationLag} >= 0`),
    check(
      'indexer_checkpoints_next_is_successor',
      sql`${table.nextBlock} = ${table.finalizedBlockNumber} + 1`,
    ),
  ],
);

export const ingestionFailures = pgTable(
  'ingestion_failures',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    runId: bigint('run_id', { mode: 'number' })
      .notNull()
      .references(() => indexerRuns.id),
    fromBlock: blockNumber('from_block').notNull(),
    toBlock: blockNumber('to_block').notNull(),
    classification: text('classification').notNull(),
    retryable: boolean('retryable').notNull(),
    attempts: integer('attempts').notNull(),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('ingestion_failures_attempts_positive', sql`${table.attempts} > 0`)],
);
