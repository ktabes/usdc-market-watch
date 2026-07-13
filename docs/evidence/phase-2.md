# Phase 2 Gate Evidence

**Status:** IN PROGRESS

**Date:** 2026-07-13

**Scope:** Reliable raw-log ingestion, normalization, PostgreSQL persistence, resumability, and diagnostics only. No derived snapshots, reconciliation, scheduler, or UI.

## Acceptance checklist

- [x] Log ranges respect HyperLend's 50-block maximum.
- [x] Bounded retry and terminal error classification are implemented and tested.
- [x] `backfill --from-block --to-block` and `sync` commands are implemented.
- [x] Queries use only the verified Pool and Phase 1 event topics; decoded results use the manifest USDC identity.
- [x] Exact raw logs, block timestamps, normalized events, decoder version, checkpoints, runs, counters, and failures are stored.
- [x] All five recorded fixtures backfill exactly once in a deterministic empty-store test.
- [x] A different overlapping range creates only duplicates and no new rows.
- [x] An interrupted run resumes from the last atomic chunk.
- [x] Repeated caught-up sync returns a no-op without data/run mutation.
- [x] Checkpoint hash mismatch and conflicting raw/block identity fail closed.
- [x] A live overlapping archive-RPC backfill passes.
- [x] Portable clean migrations pass.
- [ ] PostgreSQL persistence/uniqueness tests pass against real PostgreSQL.
- [x] Full Phase 0-2 local regression passes from the final tree.
- [x] Independent protocol, data-integrity, test, and code review approves the implementation locally.
- [ ] GitHub Actions passes on the final Phase 2 commit.

## Implementation evidence

- Manifest: `hyperlend-core-usdc-999-40367898`
- Decoder: `hyperlend-core-7a2632a-phase1-v1`
- Deterministic fixture interval: blocks `40361081` through `40367792`
- Live overlap interval: first `40367600..40367800`, then `40367650..40367800`
- Database uniqueness: `(chain_id, transaction_hash, log_index)` plus one event per raw log
- Sync start boundary: manifest block + 1

## Test evidence to date

### Default complete check

```text
npm run check
Formatting, lint, typecheck, build, sensitive-file scan  PASS
Unit/fixture test files                                  10 passed
Unit/fixture tests                                       64 passed
Integration test files                                   2 passed | 4 skipped
Integration tests                                        5 passed | 6 skipped
```

The default passing integrations are deterministic restart/idempotency scenarios and clean PGlite migrations. Live RPC and real PostgreSQL are explicit opt-ins and are accurately reported as skipped in this run.

### Live archive RPC

```text
RUN_NETWORK_INTEGRATION_TESTS=true npm run test:integration
Test Files  4 passed | 2 skipped (6)
Tests       7 passed | 4 skipped (11)
```

Pinned Phase 1 discovery and the Phase 2 overlapping network backfill passed. PostgreSQL-only tests were explicitly skipped. The network backfill inserted the expected USDC Supply, Withdraw, and Borrow activity on the first interval and inserted nothing on overlap.

### Local PostgreSQL limitation

`docker`, `psql`, `postgres`, and `pg_isready` are unavailable in the local environment, so real PostgreSQL is not claimed as a local pass. GitHub Actions must run the migration, connectivity, exact uniqueness, duplicate, typed-value, checkpoint, and block-conflict tests against PostgreSQL 17 before approval.

## Findings and fixes

1. **The previous chunk default exceeded the documented RPC limit.** Phase 0's placeholder `1000` was reduced to `50`, and environment validation now rejects larger values.
2. **Happy-path replay was not enough for idempotency.** Raw identity collisions now compare immutable block/contract/topics/data/payload evidence. Exact matches count as duplicates; mismatches fail closed.
3. **Checkpoint-only atomicity could make run evidence lag after a crash.** Block/log/event inserts, checkpoint advancement, and run counters now commit in the same transaction.
4. **A caught-up sync could have mutated only run metadata.** No-work sync now returns before creating a run, making repeated no-new-block sync fully non-mutating.
5. **A hardcoded market filter could drift from a new manifest.** The indexer now receives the underlying address from the parsed committed manifest and refuses an ABI-version mismatch.
6. **External RPC errors could expose transport URLs.** Retry/failure messages redact URLs before output or storage.
7. **CI retained the Phase 0 chunk placeholder.** The workflow still set `LOG_BLOCK_CHUNK_SIZE=1000`, which Phase 2 correctly rejects. CI now uses `50`, matching runtime validation and the documented RPC maximum.
8. **JSONB key canonicalization broke exact replay.** Comparing selected JSONB through `JSON.stringify` treated PostgreSQL's reordered object keys as a conflict. Duplicate validation now uses PostgreSQL JSONB equality for topics and decoded payloads; the real-PostgreSQL exact replay test covers this path.
9. **The first PostgreSQL 17 gate exposed an actual driver-binding defect.** [CI run 29280720839](https://github.com/ktabes/usdc-market-watch/actions/runs/29280720839) passed formatting, lint, typecheck, build, security, all 64 unit/fixture tests, migrations, connectivity, and both live network tests, but `postgres.js` could not bind a JavaScript array through its JSONB helper. Topics and decoded payloads are now guarded JSON text parameters explicitly cast to `jsonb`; semantic duplicate comparison remains PostgreSQL JSONB equality. The two other persistence failures in that run were downstream because the failed seed transaction correctly rolled back its block and raw log.

## Pending gate work

The independent reviewer approved the implementation after verifying the two blocking fixes recorded above. Real PostgreSQL evidence, the implementation commit, and CI remain pending. Phase 3 is blocked until this record says `APPROVED`.
