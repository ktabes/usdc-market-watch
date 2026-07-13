import { createHash } from 'node:crypto';
import { getAddress } from 'viem';
import type { DatabaseClient } from '../db/client.js';
import type { NormalizedMarketEvent } from '../protocol/events.js';
import { aggregateHourlyFlows } from './math.js';
import type {
  AnalyticsStore,
  HourlyFlowAggregate,
  MarketSnapshot,
  RebuildFlowsResult,
  TimedMarketEvent,
} from './types.js';

interface FlowEventRow {
  block_number: string;
  block_timestamp: string;
  event_type: NormalizedMarketEvent['eventType'];
  reserve: string | null;
  collateral_asset: string | null;
  debt_asset: string | null;
  user_address: string;
  on_behalf_of: string | null;
  counterparty: string | null;
  amount_base_units: string | null;
  debt_to_cover_base_units: string | null;
  liquidated_collateral_base_units: string | null;
  borrow_rate_ray: string | null;
  interest_rate_mode: number | null;
  referral_code: number | null;
  use_atokens: boolean | null;
  receive_atoken: boolean | null;
}

interface SnapshotRow {
  chain_id: number;
  manifest_id: string;
  block_number: string;
  block_hash: `0x${string}`;
  block_timestamp: string;
  pool_address: string;
  pool_implementation_address: string;
  protocol_data_provider_address: string;
  underlying_address: string;
  h_token_address: string;
  variable_debt_token_address: string;
  physical_available_liquidity_base_units: string;
  virtual_underlying_balance_base_units: string;
  total_h_token_supply_base_units: string;
  total_variable_debt_base_units: string;
  total_stable_debt_base_units: string;
  unbacked_base_units: string;
  accrued_to_treasury_scaled_base_units: string;
  deficit_base_units: string;
  liquidity_rate_ray: string;
  variable_borrow_rate_ray: string;
  liquidity_index_ray: string;
  variable_borrow_index_ray: string;
  utilization_ray: string;
  reserve_last_update_timestamp: string;
  reserve_factor_bps: number;
  borrowing_enabled: boolean;
  stable_borrow_rate_enabled: boolean;
  is_active: boolean;
  is_frozen: boolean;
  abi_version: string;
  calculation_version: string;
  content_hash: string;
}

interface FlowAggregateRow {
  chain_id: number;
  manifest_id: string;
  hour_start_timestamp: string;
  source_from_block: string;
  source_to_block: string;
  source_event_count: number;
  supply_count: number;
  withdraw_count: number;
  borrow_count: number;
  repay_count: number;
  liquidation_count: number;
  supply_base_units: string;
  withdraw_base_units: string;
  borrow_base_units: string;
  repay_base_units: string;
  liquidation_debt_repaid_base_units: string;
  liquidation_collateral_outflow_base_units: string;
  user_net_supply_base_units: string;
  net_variable_debt_principal_base_units: string;
  h_token_principal_delta_base_units: string;
  underlying_liquidity_principal_delta_base_units: string;
  calculation_version: string;
}

export class SnapshotConflictError extends Error {
  constructor(blockNumber: bigint) {
    super(`snapshot content conflict at block ${blockNumber.toString()}`);
    this.name = 'SnapshotConflictError';
  }
}

function required<T>(value: T | null, field: string): T {
  if (value === null) throw new Error(`stored ${field} is unexpectedly null`);
  return value;
}

function eventFromRow(row: FlowEventRow): NormalizedMarketEvent {
  switch (row.event_type) {
    case 'Supply':
      return {
        eventType: 'Supply',
        reserve: getAddress(required(row.reserve, 'reserve')),
        user: getAddress(row.user_address),
        onBehalfOf: getAddress(required(row.on_behalf_of, 'on_behalf_of')),
        amountBaseUnits: BigInt(required(row.amount_base_units, 'amount_base_units')),
        referralCode: required(row.referral_code, 'referral_code'),
      };
    case 'Withdraw':
      return {
        eventType: 'Withdraw',
        reserve: getAddress(required(row.reserve, 'reserve')),
        user: getAddress(row.user_address),
        to: getAddress(required(row.counterparty, 'counterparty')),
        amountBaseUnits: BigInt(required(row.amount_base_units, 'amount_base_units')),
      };
    case 'Borrow':
      return {
        eventType: 'Borrow',
        reserve: getAddress(required(row.reserve, 'reserve')),
        user: getAddress(row.user_address),
        onBehalfOf: getAddress(required(row.on_behalf_of, 'on_behalf_of')),
        amountBaseUnits: BigInt(required(row.amount_base_units, 'amount_base_units')),
        interestRateMode: required(row.interest_rate_mode, 'interest_rate_mode'),
        borrowRateRay: BigInt(required(row.borrow_rate_ray, 'borrow_rate_ray')),
        referralCode: required(row.referral_code, 'referral_code'),
      };
    case 'Repay':
      return {
        eventType: 'Repay',
        reserve: getAddress(required(row.reserve, 'reserve')),
        user: getAddress(row.user_address),
        repayer: getAddress(required(row.counterparty, 'counterparty')),
        amountBaseUnits: BigInt(required(row.amount_base_units, 'amount_base_units')),
        useATokens: required(row.use_atokens, 'use_atokens'),
      };
    case 'LiquidationCall':
      return {
        eventType: 'LiquidationCall',
        collateralAsset: getAddress(required(row.collateral_asset, 'collateral_asset')),
        debtAsset: getAddress(required(row.debt_asset, 'debt_asset')),
        user: getAddress(row.user_address),
        debtToCoverBaseUnits: BigInt(
          required(row.debt_to_cover_base_units, 'debt_to_cover_base_units'),
        ),
        liquidatedCollateralBaseUnits: BigInt(
          required(row.liquidated_collateral_base_units, 'liquidated_collateral_base_units'),
        ),
        liquidator: getAddress(required(row.counterparty, 'counterparty')),
        receiveAToken: required(row.receive_atoken, 'receive_atoken'),
      };
  }
}

function snapshotHash(snapshot: MarketSnapshot): string {
  const entries = Object.entries(snapshot)
    .filter(([key]) => key !== 'block')
    .sort(([left], [right]) => left.localeCompare(right));
  const canonical = JSON.stringify(
    [
      ['blockHash', snapshot.block.hash],
      ['blockNumber', snapshot.block.number],
      ['blockTimestamp', snapshot.block.timestamp],
      ...entries,
    ],
    (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value),
  );
  return createHash('sha256').update(canonical).digest('hex');
}

function snapshotFromRow(row: SnapshotRow): MarketSnapshot {
  return {
    chainId: row.chain_id,
    manifestId: row.manifest_id,
    block: {
      number: BigInt(row.block_number),
      hash: row.block_hash,
      timestamp: BigInt(row.block_timestamp),
    },
    poolAddress: getAddress(row.pool_address),
    poolImplementationAddress: getAddress(row.pool_implementation_address),
    protocolDataProviderAddress: getAddress(row.protocol_data_provider_address),
    underlyingAddress: getAddress(row.underlying_address),
    hTokenAddress: getAddress(row.h_token_address),
    variableDebtTokenAddress: getAddress(row.variable_debt_token_address),
    physicalAvailableLiquidityBaseUnits: BigInt(row.physical_available_liquidity_base_units),
    virtualUnderlyingBalanceBaseUnits: BigInt(row.virtual_underlying_balance_base_units),
    totalHTokenSupplyBaseUnits: BigInt(row.total_h_token_supply_base_units),
    totalVariableDebtBaseUnits: BigInt(row.total_variable_debt_base_units),
    totalStableDebtBaseUnits: BigInt(row.total_stable_debt_base_units),
    unbackedBaseUnits: BigInt(row.unbacked_base_units),
    accruedToTreasuryScaledBaseUnits: BigInt(row.accrued_to_treasury_scaled_base_units),
    deficitBaseUnits: BigInt(row.deficit_base_units),
    liquidityRateRay: BigInt(row.liquidity_rate_ray),
    variableBorrowRateRay: BigInt(row.variable_borrow_rate_ray),
    liquidityIndexRay: BigInt(row.liquidity_index_ray),
    variableBorrowIndexRay: BigInt(row.variable_borrow_index_ray),
    utilizationRay: BigInt(row.utilization_ray),
    reserveLastUpdateTimestamp: BigInt(row.reserve_last_update_timestamp),
    reserveFactorBps: row.reserve_factor_bps,
    borrowingEnabled: row.borrowing_enabled,
    stableBorrowRateEnabled: row.stable_borrow_rate_enabled,
    isActive: row.is_active,
    isFrozen: row.is_frozen,
    abiVersion: row.abi_version,
    calculationVersion: row.calculation_version,
  };
}

function flowFromRow(row: FlowAggregateRow): HourlyFlowAggregate {
  return {
    chainId: row.chain_id,
    manifestId: row.manifest_id,
    hourStartTimestamp: BigInt(row.hour_start_timestamp),
    sourceFromBlock: BigInt(row.source_from_block),
    sourceToBlock: BigInt(row.source_to_block),
    sourceEventCount: row.source_event_count,
    supplyCount: row.supply_count,
    withdrawCount: row.withdraw_count,
    borrowCount: row.borrow_count,
    repayCount: row.repay_count,
    liquidationCount: row.liquidation_count,
    supplyBaseUnits: BigInt(row.supply_base_units),
    withdrawBaseUnits: BigInt(row.withdraw_base_units),
    borrowBaseUnits: BigInt(row.borrow_base_units),
    repayBaseUnits: BigInt(row.repay_base_units),
    liquidationDebtRepaidBaseUnits: BigInt(row.liquidation_debt_repaid_base_units),
    liquidationCollateralOutflowBaseUnits: BigInt(row.liquidation_collateral_outflow_base_units),
    userNetSupplyBaseUnits: BigInt(row.user_net_supply_base_units),
    netVariableDebtPrincipalBaseUnits: BigInt(row.net_variable_debt_principal_base_units),
    hTokenPrincipalDeltaBaseUnits: BigInt(row.h_token_principal_delta_base_units),
    underlyingLiquidityPrincipalDeltaBaseUnits: BigInt(
      row.underlying_liquidity_principal_delta_base_units,
    ),
    calculationVersion: row.calculation_version,
  };
}

export class PostgresAnalyticsStore implements AnalyticsStore {
  constructor(private readonly sql: DatabaseClient) {}

  async persistSnapshot(snapshot: MarketSnapshot): Promise<'inserted' | 'duplicate'> {
    return this.sql.begin(async (transaction) => {
      const existingBlock = await transaction<{ block_hash: string; block_timestamp: string }[]>`
        select block_hash, block_timestamp from blocks
        where chain_id = ${snapshot.chainId}
          and block_number = ${snapshot.block.number.toString()}
      `;
      if (
        existingBlock[0] &&
        (existingBlock[0].block_hash !== snapshot.block.hash ||
          BigInt(existingBlock[0].block_timestamp) !== snapshot.block.timestamp)
      ) {
        throw new SnapshotConflictError(snapshot.block.number);
      }
      await transaction`
        insert into blocks (chain_id, block_number, block_hash, block_timestamp)
        values (
          ${snapshot.chainId}, ${snapshot.block.number.toString()}, ${snapshot.block.hash},
          ${snapshot.block.timestamp.toString()}
        )
        on conflict (chain_id, block_number) do nothing
      `;

      const contentHash = snapshotHash(snapshot);
      const inserted = await transaction<{ id: string | number }[]>`
        insert into market_snapshots (
          chain_id, manifest_id, block_number, block_hash, block_timestamp,
          pool_address, pool_implementation_address, protocol_data_provider_address,
          underlying_address, h_token_address, variable_debt_token_address,
          physical_available_liquidity_base_units, virtual_underlying_balance_base_units,
          total_h_token_supply_base_units, total_variable_debt_base_units,
          total_stable_debt_base_units, unbacked_base_units,
          accrued_to_treasury_scaled_base_units, deficit_base_units, liquidity_rate_ray,
          variable_borrow_rate_ray, liquidity_index_ray, variable_borrow_index_ray,
          utilization_ray, reserve_last_update_timestamp, reserve_factor_bps,
          borrowing_enabled, stable_borrow_rate_enabled, is_active, is_frozen,
          abi_version, calculation_version, content_hash
        ) values (
          ${snapshot.chainId}, ${snapshot.manifestId}, ${snapshot.block.number.toString()},
          ${snapshot.block.hash}, ${snapshot.block.timestamp.toString()},
          ${snapshot.poolAddress}, ${snapshot.poolImplementationAddress},
          ${snapshot.protocolDataProviderAddress}, ${snapshot.underlyingAddress},
          ${snapshot.hTokenAddress}, ${snapshot.variableDebtTokenAddress},
          ${snapshot.physicalAvailableLiquidityBaseUnits.toString()},
          ${snapshot.virtualUnderlyingBalanceBaseUnits.toString()},
          ${snapshot.totalHTokenSupplyBaseUnits.toString()},
          ${snapshot.totalVariableDebtBaseUnits.toString()},
          ${snapshot.totalStableDebtBaseUnits.toString()}, ${snapshot.unbackedBaseUnits.toString()},
          ${snapshot.accruedToTreasuryScaledBaseUnits.toString()},
          ${snapshot.deficitBaseUnits.toString()}, ${snapshot.liquidityRateRay.toString()},
          ${snapshot.variableBorrowRateRay.toString()}, ${snapshot.liquidityIndexRay.toString()},
          ${snapshot.variableBorrowIndexRay.toString()}, ${snapshot.utilizationRay.toString()},
          ${snapshot.reserveLastUpdateTimestamp.toString()}, ${snapshot.reserveFactorBps},
          ${snapshot.borrowingEnabled}, ${snapshot.stableBorrowRateEnabled},
          ${snapshot.isActive}, ${snapshot.isFrozen}, ${snapshot.abiVersion},
          ${snapshot.calculationVersion}, ${contentHash}
        )
        on conflict (chain_id, block_number, calculation_version) do nothing
        returning id
      `;
      if (inserted[0]) return 'inserted';

      const existing = await transaction<{ content_hash: string }[]>`
        select content_hash from market_snapshots
        where chain_id = ${snapshot.chainId}
          and block_number = ${snapshot.block.number.toString()}
          and calculation_version = ${snapshot.calculationVersion}
      `;
      if (existing[0]?.content_hash !== contentHash) {
        throw new SnapshotConflictError(snapshot.block.number);
      }
      return 'duplicate';
    });
  }

  async rebuildHourlyFlows(input: {
    readonly chainId: number;
    readonly manifestId: string;
    readonly underlyingAddress: `0x${string}`;
    readonly calculationVersion: string;
  }): Promise<RebuildFlowsResult> {
    return this.sql.begin(async (transaction) => {
      const rows = await transaction<FlowEventRow[]>`
        select r.block_number, r.block_timestamp, e.event_type, e.reserve,
               e.collateral_asset, e.debt_asset, e.user_address, e.on_behalf_of,
               e.counterparty, e.amount_base_units, e.debt_to_cover_base_units,
               e.liquidated_collateral_base_units, e.borrow_rate_ray,
               e.interest_rate_mode, e.referral_code, e.use_atokens, e.receive_atoken
        from raw_logs r
        join market_events e on e.raw_log_id = r.id
        where r.chain_id = ${input.chainId}
        order by r.block_number, r.transaction_index, r.log_index
      `;
      const events: TimedMarketEvent[] = rows.map((row) => ({
        blockNumber: BigInt(row.block_number),
        blockTimestamp: BigInt(row.block_timestamp),
        event: eventFromRow(row),
      }));
      const aggregates = aggregateHourlyFlows({
        ...input,
        underlyingAddress: getAddress(input.underlyingAddress),
        events,
      });

      await transaction`
        delete from hourly_flow_aggregates
        where chain_id = ${input.chainId}
          and manifest_id = ${input.manifestId}
          and calculation_version = ${input.calculationVersion}
      `;
      for (const aggregate of aggregates) {
        await transaction`
          insert into hourly_flow_aggregates (
            chain_id, manifest_id, hour_start_timestamp, source_from_block, source_to_block,
            source_event_count, supply_count, withdraw_count, borrow_count, repay_count,
            liquidation_count, supply_base_units, withdraw_base_units, borrow_base_units,
            repay_base_units, liquidation_debt_repaid_base_units,
            liquidation_collateral_outflow_base_units, user_net_supply_base_units,
            net_variable_debt_principal_base_units, h_token_principal_delta_base_units,
            underlying_liquidity_principal_delta_base_units, calculation_version
          ) values (
            ${aggregate.chainId}, ${aggregate.manifestId},
            ${aggregate.hourStartTimestamp.toString()}, ${aggregate.sourceFromBlock.toString()},
            ${aggregate.sourceToBlock.toString()}, ${aggregate.sourceEventCount},
            ${aggregate.supplyCount}, ${aggregate.withdrawCount}, ${aggregate.borrowCount},
            ${aggregate.repayCount}, ${aggregate.liquidationCount},
            ${aggregate.supplyBaseUnits.toString()}, ${aggregate.withdrawBaseUnits.toString()},
            ${aggregate.borrowBaseUnits.toString()}, ${aggregate.repayBaseUnits.toString()},
            ${aggregate.liquidationDebtRepaidBaseUnits.toString()},
            ${aggregate.liquidationCollateralOutflowBaseUnits.toString()},
            ${aggregate.userNetSupplyBaseUnits.toString()},
            ${aggregate.netVariableDebtPrincipalBaseUnits.toString()},
            ${aggregate.hTokenPrincipalDeltaBaseUnits.toString()},
            ${aggregate.underlyingLiquidityPrincipalDeltaBaseUnits.toString()},
            ${aggregate.calculationVersion}
          )
        `;
      }

      const firstEvent = events[0];
      const lastEvent = events.at(-1);
      return {
        bucketCount: aggregates.length,
        eventCount: events.length,
        ...(firstEvent ? { fromBlock: firstEvent.blockNumber } : {}),
        ...(lastEvent ? { toBlock: lastEvent.blockNumber } : {}),
      };
    });
  }

  async getLatestSnapshot(input: {
    readonly chainId: number;
    readonly manifestId: string;
    readonly calculationVersion: string;
  }): Promise<MarketSnapshot | undefined> {
    const rows = await this.sql<SnapshotRow[]>`
      select * from market_snapshots
      where chain_id = ${input.chainId}
        and manifest_id = ${input.manifestId}
        and calculation_version = ${input.calculationVersion}
      order by block_number desc
      limit 1
    `;
    return rows[0] ? snapshotFromRow(rows[0]) : undefined;
  }

  async getHourlyFlows(input: {
    readonly chainId: number;
    readonly manifestId: string;
    readonly calculationVersion: string;
    readonly fromTimestamp: bigint;
    readonly toTimestamp: bigint;
  }): Promise<readonly HourlyFlowAggregate[]> {
    const rows = await this.sql<FlowAggregateRow[]>`
      select * from hourly_flow_aggregates
      where chain_id = ${input.chainId}
        and manifest_id = ${input.manifestId}
        and calculation_version = ${input.calculationVersion}
        and hour_start_timestamp >= ${input.fromTimestamp.toString()}
        and hour_start_timestamp <= ${input.toTimestamp.toString()}
      order by hour_start_timestamp
    `;
    return rows.map(flowFromRow);
  }
}
