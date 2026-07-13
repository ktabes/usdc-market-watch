CREATE TABLE "blocks" (
	"chain_id" integer NOT NULL,
	"block_number" numeric(78, 0) NOT NULL,
	"block_hash" text NOT NULL,
	"block_timestamp" numeric(78, 0) NOT NULL,
	"inserted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_chain_id_block_number_pk" PRIMARY KEY("chain_id","block_number")
);
--> statement-breakpoint
CREATE TABLE "indexer_checkpoints" (
	"checkpoint_key" text PRIMARY KEY NOT NULL,
	"manifest_id" text NOT NULL,
	"chain_id" integer NOT NULL,
	"next_block" numeric(78, 0) NOT NULL,
	"finalized_block_number" numeric(78, 0) NOT NULL,
	"finalized_block_hash" text NOT NULL,
	"confirmation_lag" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexer_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"command" text NOT NULL,
	"checkpoint_key" text NOT NULL,
	"manifest_id" text NOT NULL,
	"chain_id" integer NOT NULL,
	"requested_from_block" numeric(78, 0) NOT NULL,
	"requested_to_block" numeric(78, 0) NOT NULL,
	"finalized_head_block" numeric(78, 0) NOT NULL,
	"status" text NOT NULL,
	"ranges_completed" integer DEFAULT 0 NOT NULL,
	"logs_fetched" integer DEFAULT 0 NOT NULL,
	"decoded_count" integer DEFAULT 0 NOT NULL,
	"filtered_count" integer DEFAULT 0 NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"failure_detail" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ingestion_failures" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" bigint NOT NULL,
	"from_block" numeric(78, 0) NOT NULL,
	"to_block" numeric(78, 0) NOT NULL,
	"classification" text NOT NULL,
	"retryable" boolean NOT NULL,
	"attempts" integer NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"raw_log_id" bigint NOT NULL,
	"event_type" text NOT NULL,
	"reserve" text,
	"collateral_asset" text,
	"debt_asset" text,
	"user_address" text NOT NULL,
	"on_behalf_of" text,
	"counterparty" text,
	"amount_base_units" numeric(78, 0),
	"debt_to_cover_base_units" numeric(78, 0),
	"liquidated_collateral_base_units" numeric(78, 0),
	"borrow_rate_ray" numeric(78, 0),
	"interest_rate_mode" integer,
	"referral_code" integer,
	"use_atokens" boolean,
	"receive_atoken" boolean,
	"inserted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"block_number" numeric(78, 0) NOT NULL,
	"block_hash" text NOT NULL,
	"block_timestamp" numeric(78, 0) NOT NULL,
	"transaction_hash" text NOT NULL,
	"transaction_index" integer NOT NULL,
	"log_index" integer NOT NULL,
	"contract_address" text NOT NULL,
	"topics" jsonb NOT NULL,
	"data" text NOT NULL,
	"decoded_event_name" text NOT NULL,
	"decoded_payload" jsonb NOT NULL,
	"decoder_version" text NOT NULL,
	"source_run_id" bigint NOT NULL,
	"inserted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingestion_failures" ADD CONSTRAINT "ingestion_failures_run_id_indexer_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."indexer_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_events" ADD CONSTRAINT "market_events_raw_log_id_raw_logs_id_fk" FOREIGN KEY ("raw_log_id") REFERENCES "public"."raw_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_logs" ADD CONSTRAINT "raw_logs_source_run_id_indexer_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."indexer_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "raw_logs_chain_transaction_log_unique" ON "raw_logs" USING btree ("chain_id","transaction_hash","log_index");