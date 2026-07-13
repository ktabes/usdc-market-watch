# Phase 2 Indexing Operations

## Scope

The indexer covers the single verified HyperLend core-pool USDC market from the committed Phase 1 manifest. It reads direct HyperEVM JSON-RPC logs and block headers; the HyperLend HTTP API is not part of ingestion or correctness.

Phase 2 stores source blocks, immutable raw logs, normalized market events, checkpoints, run summaries, and terminal failures. It does not calculate snapshots, aggregates, reconciliation, or alerts; those remain gated Phase 3-4 work.

## RPC constraints

[HyperLend's RPC documentation](https://docs.hyperlend.finance/developer-documentation/data-and-indexers) currently states a 50-block maximum `eth_getLogs` range on the regular endpoint and a 30-request/second per-IP rate limit. The archive endpoint provides full history.

- Every planned log range is inclusive and at most 50 blocks.
- `LOG_BLOCK_CHUNK_SIZE` is validated from 1 through 50; the default is 50.
- The client throttles requests to at most 30 per second.
- Transient rate-limit, timeout, network, and server failures retry at most four times with bounded exponential delay.
- Invalid requests and oversized ranges fail immediately.
- Stored failure messages redact RPC URLs.

## Commands

Apply migrations before indexing:

```bash
npm run db:migrate
```

Backfill an explicit finalized interval:

```bash
npm run backfill -- --from-block 40367600 --to-block 40367800
```

Synchronize from the committed manifest's next block through the current finalized head:

```bash
npm run sync
```

The first `sync` begins at manifest block `40367898 + 1`. Later syncs resume from the stored canonical checkpoint. The finalized head is `latestBlock - CONFIRMATION_LAG`. An explicit backfill is rejected if its end is newer than that head.

Commands print a JSON run report. Financial and block integers are serialized as decimal strings.

## Filtering and normalization

The RPC query is restricted to the manifest's Pool address and the five versioned Phase 1 topics: `Supply`, `Withdraw`, `Borrow`, `Repay`, and `LiquidationCall`. Decoded logs are then retained only when the manifest's USDC is the reserve, debt asset, or collateral asset according to the Phase 1 rules.

The indexer validates that the manifest ABI version matches the active decoder before any range begins. Every retained row keeps:

- Chain ID, block number/hash/timestamp.
- Transaction hash/index and log index.
- Contract, exact topics, and exact data.
- Decoder version, event name, and full normalized JSON payload.
- Typed normalized event columns for later exact queries.

## Idempotency and checkpoints

Raw-log identity is uniquely constrained by `(chain_id, transaction_hash, log_index)`. A replay with identical content increments the run's duplicate count and does not create another raw or normalized event. The same identity with different block hash, contract, topics, data, or payload fails closed.

Each backfill interval gets a range-specific checkpoint key. This permits an interrupted exact rerun to resume while a different overlapping range still replays through database uniqueness. `sync` uses one manifest-specific checkpoint.

For each chunk, the following occur in one PostgreSQL transaction:

1. Validate or insert event and checkpoint block headers.
2. Insert new raw logs and their normalized events.
3. Validate exact duplicates.
4. Advance the checkpoint to the chunk end and hash.
5. Increment the run's fetched/decoded/filtered/inserted/duplicate counters.

A crash before commit changes none of them. A crash after commit may leave the run marked `running`, but the next single-writer invocation marks it as superseded and resumes from the committed checkpoint. Before any resume, the saved finalized block hash is reread from RPC; a mismatch stops the run.

A caught-up `sync` returns `noOp: true` without creating a run or mutating stored data.

## Tables

| Table                 | Purpose                                                                       |
| --------------------- | ----------------------------------------------------------------------------- |
| `blocks`              | Pinned block hash and timestamp evidence used by retained events/checkpoints. |
| `raw_logs`            | Immutable source logs and decoder provenance.                                 |
| `market_events`       | One typed normalized event per raw log.                                       |
| `indexer_checkpoints` | Next block plus finalized block/hash and lag.                                 |
| `indexer_runs`        | Command boundaries and diagnosable counters/status.                           |
| `ingestion_failures`  | Terminal range failure classification, attempts, and redacted message.        |

The database also enforces event types, run states, nonnegative counters/indexes, checkpoint successor structure, and one normalized event per raw log.

## Operational boundary

Phase 2 supports one active writer. A hosted scheduler, distributed lease, and concurrent writers are deliberately deferred; do not run multiple backfill/sync processes against the same database. Repeated sequential development syncs are safe and tested.
