ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_state_nonnegative" CHECK ("market_snapshots"."block_timestamp" >= 0 and
          "market_snapshots"."physical_available_liquidity_base_units" >= 0 and
          "market_snapshots"."virtual_underlying_balance_base_units" >= 0 and
          "market_snapshots"."total_h_token_supply_base_units" >= 0 and
          "market_snapshots"."total_variable_debt_base_units" >= 0 and
          "market_snapshots"."total_stable_debt_base_units" >= 0 and "market_snapshots"."unbacked_base_units" >= 0 and
          "market_snapshots"."accrued_to_treasury_scaled_base_units" >= 0 and "market_snapshots"."deficit_base_units" >= 0 and
          "market_snapshots"."liquidity_rate_ray" >= 0 and "market_snapshots"."variable_borrow_rate_ray" >= 0 and
          "market_snapshots"."liquidity_index_ray" >= 0 and "market_snapshots"."variable_borrow_index_ray" >= 0 and
          "market_snapshots"."reserve_last_update_timestamp" >= 0);--> statement-breakpoint
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_content_hash_valid" CHECK (char_length("market_snapshots"."content_hash") = 64);