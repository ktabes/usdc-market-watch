import {
  bigserial,
  bigint,
  boolean,
  foreignKey,
  index,
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

export const hourlyFlowAggregates = pgTable(
  'hourly_flow_aggregates',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    chainId: integer('chain_id').notNull(),
    manifestId: text('manifest_id').notNull(),
    hourStartTimestamp: blockNumber('hour_start_timestamp').notNull(),
    sourceFromBlock: blockNumber('source_from_block').notNull(),
    sourceToBlock: blockNumber('source_to_block').notNull(),
    sourceEventCount: integer('source_event_count').notNull(),
    supplyCount: integer('supply_count').notNull(),
    withdrawCount: integer('withdraw_count').notNull(),
    borrowCount: integer('borrow_count').notNull(),
    repayCount: integer('repay_count').notNull(),
    liquidationCount: integer('liquidation_count').notNull(),
    supplyBaseUnits: uint256('supply_base_units').notNull(),
    withdrawBaseUnits: uint256('withdraw_base_units').notNull(),
    borrowBaseUnits: uint256('borrow_base_units').notNull(),
    repayBaseUnits: uint256('repay_base_units').notNull(),
    liquidationDebtRepaidBaseUnits: uint256('liquidation_debt_repaid_base_units').notNull(),
    liquidationCollateralOutflowBaseUnits: uint256(
      'liquidation_collateral_outflow_base_units',
    ).notNull(),
    userNetSupplyBaseUnits: numeric('user_net_supply_base_units', {
      precision: 78,
      scale: 0,
      mode: 'bigint',
    }).notNull(),
    netVariableDebtPrincipalBaseUnits: numeric('net_variable_debt_principal_base_units', {
      precision: 78,
      scale: 0,
      mode: 'bigint',
    }).notNull(),
    hTokenPrincipalDeltaBaseUnits: numeric('h_token_principal_delta_base_units', {
      precision: 78,
      scale: 0,
      mode: 'bigint',
    }).notNull(),
    underlyingLiquidityPrincipalDeltaBaseUnits: numeric(
      'underlying_liquidity_principal_delta_base_units',
      { precision: 78, scale: 0, mode: 'bigint' },
    ).notNull(),
    calculationVersion: text('calculation_version').notNull(),
    calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('hourly_flows_identity_unique').on(
      table.chainId,
      table.manifestId,
      table.hourStartTimestamp,
      table.calculationVersion,
    ),
    index('hourly_flows_time_index').on(table.chainId, table.hourStartTimestamp),
    check('hourly_flows_chain_positive', sql`${table.chainId} > 0`),
    check(
      'hourly_flows_hour_aligned',
      sql`${table.hourStartTimestamp} >= 0 and mod(${table.hourStartTimestamp}, 3600) = 0`,
    ),
    check(
      'hourly_flows_source_range_valid',
      sql`${table.sourceFromBlock} >= 0 and ${table.sourceToBlock} >= ${table.sourceFromBlock}`,
    ),
    check(
      'hourly_flows_counts_valid',
      sql`${table.sourceEventCount} > 0 and
          ${table.supplyCount} >= 0 and ${table.withdrawCount} >= 0 and
          ${table.borrowCount} >= 0 and ${table.repayCount} >= 0 and
          ${table.liquidationCount} >= 0 and
          ${table.sourceEventCount} = ${table.supplyCount} + ${table.withdrawCount} +
            ${table.borrowCount} + ${table.repayCount} + ${table.liquidationCount}`,
    ),
    check(
      'hourly_flows_amounts_nonnegative',
      sql`${table.supplyBaseUnits} >= 0 and ${table.withdrawBaseUnits} >= 0 and
          ${table.borrowBaseUnits} >= 0 and ${table.repayBaseUnits} >= 0 and
          ${table.liquidationDebtRepaidBaseUnits} >= 0 and
          ${table.liquidationCollateralOutflowBaseUnits} >= 0`,
    ),
  ],
);

export const marketSnapshots = pgTable(
  'market_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    chainId: integer('chain_id').notNull(),
    manifestId: text('manifest_id').notNull(),
    blockNumber: blockNumber('block_number').notNull(),
    blockHash: text('block_hash').notNull(),
    blockTimestamp: blockNumber('block_timestamp').notNull(),
    poolAddress: text('pool_address').notNull(),
    poolImplementationAddress: text('pool_implementation_address').notNull(),
    protocolDataProviderAddress: text('protocol_data_provider_address').notNull(),
    underlyingAddress: text('underlying_address').notNull(),
    hTokenAddress: text('h_token_address').notNull(),
    variableDebtTokenAddress: text('variable_debt_token_address').notNull(),
    physicalAvailableLiquidityBaseUnits: uint256(
      'physical_available_liquidity_base_units',
    ).notNull(),
    virtualUnderlyingBalanceBaseUnits: uint256('virtual_underlying_balance_base_units').notNull(),
    totalHTokenSupplyBaseUnits: uint256('total_h_token_supply_base_units').notNull(),
    totalVariableDebtBaseUnits: uint256('total_variable_debt_base_units').notNull(),
    totalStableDebtBaseUnits: uint256('total_stable_debt_base_units').notNull(),
    unbackedBaseUnits: uint256('unbacked_base_units').notNull(),
    accruedToTreasuryScaledBaseUnits: uint256('accrued_to_treasury_scaled_base_units').notNull(),
    deficitBaseUnits: uint256('deficit_base_units').notNull(),
    liquidityRateRay: uint256('liquidity_rate_ray').notNull(),
    variableBorrowRateRay: uint256('variable_borrow_rate_ray').notNull(),
    liquidityIndexRay: uint256('liquidity_index_ray').notNull(),
    variableBorrowIndexRay: uint256('variable_borrow_index_ray').notNull(),
    utilizationRay: uint256('utilization_ray').notNull(),
    reserveLastUpdateTimestamp: blockNumber('reserve_last_update_timestamp').notNull(),
    reserveFactorBps: integer('reserve_factor_bps').notNull(),
    borrowingEnabled: boolean('borrowing_enabled').notNull(),
    stableBorrowRateEnabled: boolean('stable_borrow_rate_enabled').notNull(),
    isActive: boolean('is_active').notNull(),
    isFrozen: boolean('is_frozen').notNull(),
    abiVersion: text('abi_version').notNull(),
    calculationVersion: text('calculation_version').notNull(),
    contentHash: text('content_hash').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('market_snapshots_identity_unique').on(
      table.chainId,
      table.blockNumber,
      table.calculationVersion,
    ),
    index('market_snapshots_latest_index').on(table.chainId, table.blockNumber),
    foreignKey({
      columns: [table.chainId, table.blockNumber],
      foreignColumns: [blocks.chainId, blocks.blockNumber],
      name: 'market_snapshots_block_fk',
    }),
    check('market_snapshots_chain_positive', sql`${table.chainId} > 0`),
    check('market_snapshots_block_nonnegative', sql`${table.blockNumber} >= 0`),
    check(
      'market_snapshots_state_nonnegative',
      sql`${table.blockTimestamp} >= 0 and
          ${table.physicalAvailableLiquidityBaseUnits} >= 0 and
          ${table.virtualUnderlyingBalanceBaseUnits} >= 0 and
          ${table.totalHTokenSupplyBaseUnits} >= 0 and
          ${table.totalVariableDebtBaseUnits} >= 0 and
          ${table.totalStableDebtBaseUnits} >= 0 and ${table.unbackedBaseUnits} >= 0 and
          ${table.accruedToTreasuryScaledBaseUnits} >= 0 and ${table.deficitBaseUnits} >= 0 and
          ${table.liquidityRateRay} >= 0 and ${table.variableBorrowRateRay} >= 0 and
          ${table.liquidityIndexRay} >= 0 and ${table.variableBorrowIndexRay} >= 0 and
          ${table.reserveLastUpdateTimestamp} >= 0`,
    ),
    check(
      'market_snapshots_utilization_valid',
      sql`${table.utilizationRay} >= 0 and ${table.utilizationRay} <= 1000000000000000000000000000`,
    ),
    check(
      'market_snapshots_configuration_valid',
      sql`${table.reserveFactorBps} >= 0 and ${table.reserveFactorBps} <= 10000`,
    ),
    check('market_snapshots_content_hash_valid', sql`char_length(${table.contentHash}) = 64`),
  ],
);
