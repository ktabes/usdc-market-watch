CREATE TABLE "hourly_flow_aggregates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"manifest_id" text NOT NULL,
	"hour_start_timestamp" numeric(78, 0) NOT NULL,
	"source_from_block" numeric(78, 0) NOT NULL,
	"source_to_block" numeric(78, 0) NOT NULL,
	"source_event_count" integer NOT NULL,
	"supply_count" integer NOT NULL,
	"withdraw_count" integer NOT NULL,
	"borrow_count" integer NOT NULL,
	"repay_count" integer NOT NULL,
	"liquidation_count" integer NOT NULL,
	"supply_base_units" numeric(78, 0) NOT NULL,
	"withdraw_base_units" numeric(78, 0) NOT NULL,
	"borrow_base_units" numeric(78, 0) NOT NULL,
	"repay_base_units" numeric(78, 0) NOT NULL,
	"liquidation_debt_repaid_base_units" numeric(78, 0) NOT NULL,
	"liquidation_collateral_outflow_base_units" numeric(78, 0) NOT NULL,
	"user_net_supply_base_units" numeric(78, 0) NOT NULL,
	"net_variable_debt_principal_base_units" numeric(78, 0) NOT NULL,
	"h_token_principal_delta_base_units" numeric(78, 0) NOT NULL,
	"underlying_liquidity_principal_delta_base_units" numeric(78, 0) NOT NULL,
	"calculation_version" text NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hourly_flows_chain_positive" CHECK ("hourly_flow_aggregates"."chain_id" > 0),
	CONSTRAINT "hourly_flows_hour_aligned" CHECK ("hourly_flow_aggregates"."hour_start_timestamp" >= 0 and mod("hourly_flow_aggregates"."hour_start_timestamp", 3600) = 0),
	CONSTRAINT "hourly_flows_source_range_valid" CHECK ("hourly_flow_aggregates"."source_from_block" >= 0 and "hourly_flow_aggregates"."source_to_block" >= "hourly_flow_aggregates"."source_from_block"),
	CONSTRAINT "hourly_flows_counts_valid" CHECK ("hourly_flow_aggregates"."source_event_count" > 0 and
          "hourly_flow_aggregates"."supply_count" >= 0 and "hourly_flow_aggregates"."withdraw_count" >= 0 and
          "hourly_flow_aggregates"."borrow_count" >= 0 and "hourly_flow_aggregates"."repay_count" >= 0 and
          "hourly_flow_aggregates"."liquidation_count" >= 0 and
          "hourly_flow_aggregates"."source_event_count" = "hourly_flow_aggregates"."supply_count" + "hourly_flow_aggregates"."withdraw_count" +
            "hourly_flow_aggregates"."borrow_count" + "hourly_flow_aggregates"."repay_count" + "hourly_flow_aggregates"."liquidation_count"),
	CONSTRAINT "hourly_flows_amounts_nonnegative" CHECK ("hourly_flow_aggregates"."supply_base_units" >= 0 and "hourly_flow_aggregates"."withdraw_base_units" >= 0 and
          "hourly_flow_aggregates"."borrow_base_units" >= 0 and "hourly_flow_aggregates"."repay_base_units" >= 0 and
          "hourly_flow_aggregates"."liquidation_debt_repaid_base_units" >= 0 and
          "hourly_flow_aggregates"."liquidation_collateral_outflow_base_units" >= 0)
);
--> statement-breakpoint
CREATE TABLE "market_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"manifest_id" text NOT NULL,
	"block_number" numeric(78, 0) NOT NULL,
	"block_hash" text NOT NULL,
	"block_timestamp" numeric(78, 0) NOT NULL,
	"pool_address" text NOT NULL,
	"pool_implementation_address" text NOT NULL,
	"protocol_data_provider_address" text NOT NULL,
	"underlying_address" text NOT NULL,
	"h_token_address" text NOT NULL,
	"variable_debt_token_address" text NOT NULL,
	"physical_available_liquidity_base_units" numeric(78, 0) NOT NULL,
	"virtual_underlying_balance_base_units" numeric(78, 0) NOT NULL,
	"total_h_token_supply_base_units" numeric(78, 0) NOT NULL,
	"total_variable_debt_base_units" numeric(78, 0) NOT NULL,
	"total_stable_debt_base_units" numeric(78, 0) NOT NULL,
	"unbacked_base_units" numeric(78, 0) NOT NULL,
	"accrued_to_treasury_scaled_base_units" numeric(78, 0) NOT NULL,
	"deficit_base_units" numeric(78, 0) NOT NULL,
	"liquidity_rate_ray" numeric(78, 0) NOT NULL,
	"variable_borrow_rate_ray" numeric(78, 0) NOT NULL,
	"liquidity_index_ray" numeric(78, 0) NOT NULL,
	"variable_borrow_index_ray" numeric(78, 0) NOT NULL,
	"utilization_ray" numeric(78, 0) NOT NULL,
	"reserve_last_update_timestamp" numeric(78, 0) NOT NULL,
	"reserve_factor_bps" integer NOT NULL,
	"borrowing_enabled" boolean NOT NULL,
	"stable_borrow_rate_enabled" boolean NOT NULL,
	"is_active" boolean NOT NULL,
	"is_frozen" boolean NOT NULL,
	"abi_version" text NOT NULL,
	"calculation_version" text NOT NULL,
	"content_hash" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_snapshots_chain_positive" CHECK ("market_snapshots"."chain_id" > 0),
	CONSTRAINT "market_snapshots_block_nonnegative" CHECK ("market_snapshots"."block_number" >= 0),
	CONSTRAINT "market_snapshots_utilization_valid" CHECK ("market_snapshots"."utilization_ray" >= 0 and "market_snapshots"."utilization_ray" <= 1000000000000000000000000000),
	CONSTRAINT "market_snapshots_configuration_valid" CHECK ("market_snapshots"."reserve_factor_bps" >= 0 and "market_snapshots"."reserve_factor_bps" <= 10000)
);
--> statement-breakpoint
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_block_fk" FOREIGN KEY ("chain_id","block_number") REFERENCES "public"."blocks"("chain_id","block_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hourly_flows_identity_unique" ON "hourly_flow_aggregates" USING btree ("chain_id","manifest_id","hour_start_timestamp","calculation_version");--> statement-breakpoint
CREATE INDEX "hourly_flows_time_index" ON "hourly_flow_aggregates" USING btree ("chain_id","hour_start_timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "market_snapshots_identity_unique" ON "market_snapshots" USING btree ("chain_id","block_number","calculation_version");--> statement-breakpoint
CREATE INDEX "market_snapshots_latest_index" ON "market_snapshots" USING btree ("chain_id","block_number");