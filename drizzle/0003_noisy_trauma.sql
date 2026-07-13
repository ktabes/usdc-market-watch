ALTER TABLE "blocks" ADD CONSTRAINT "blocks_chain_positive" CHECK ("blocks"."chain_id" > 0);--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_number_nonnegative" CHECK ("blocks"."block_number" >= 0);--> statement-breakpoint
ALTER TABLE "indexer_checkpoints" ADD CONSTRAINT "indexer_checkpoints_lag_nonnegative" CHECK ("indexer_checkpoints"."confirmation_lag" >= 0);--> statement-breakpoint
ALTER TABLE "indexer_checkpoints" ADD CONSTRAINT "indexer_checkpoints_next_is_successor" CHECK ("indexer_checkpoints"."next_block" = "indexer_checkpoints"."finalized_block_number" + 1);--> statement-breakpoint
ALTER TABLE "indexer_runs" ADD CONSTRAINT "indexer_runs_command_valid" CHECK ("indexer_runs"."command" in ('backfill', 'sync'));--> statement-breakpoint
ALTER TABLE "indexer_runs" ADD CONSTRAINT "indexer_runs_status_valid" CHECK ("indexer_runs"."status" in ('running', 'completed', 'failed'));--> statement-breakpoint
ALTER TABLE "indexer_runs" ADD CONSTRAINT "indexer_runs_counters_nonnegative" CHECK ("indexer_runs"."ranges_completed" >= 0 and "indexer_runs"."logs_fetched" >= 0 and
          "indexer_runs"."decoded_count" >= 0 and "indexer_runs"."filtered_count" >= 0 and
          "indexer_runs"."inserted_count" >= 0 and "indexer_runs"."duplicate_count" >= 0 and
          "indexer_runs"."failure_count" >= 0);--> statement-breakpoint
ALTER TABLE "ingestion_failures" ADD CONSTRAINT "ingestion_failures_attempts_positive" CHECK ("ingestion_failures"."attempts" > 0);--> statement-breakpoint
ALTER TABLE "market_events" ADD CONSTRAINT "market_events_type_valid" CHECK ("market_events"."event_type" in ('Supply', 'Withdraw', 'Borrow', 'Repay', 'LiquidationCall'));--> statement-breakpoint
ALTER TABLE "raw_logs" ADD CONSTRAINT "raw_logs_indexes_nonnegative" CHECK ("raw_logs"."transaction_index" >= 0 and "raw_logs"."log_index" >= 0);