# Phase 3 Gate Evidence

**Status:** APPROVED

**Date:** 2026-07-13

**Scope:** Derived hourly flows, authoritative block-pinned market snapshots, deterministic rebuilds, provenance, and read-only queries only. No reconciliation, anomaly engine, scheduler, or UI.

## Acceptance checklist

- [x] Approved Phase 2 immutable blocks, raw logs, and normalized events remain the only derivation sources.
- [x] Hourly flow aggregates retain manifest, calculation version, source block range, timestamp, counts, and exact integer components.
- [x] Market snapshots retain block/hash/timestamp, source contracts, ABI/calculation versions, raw authoritative state, and exact utilization.
- [x] Aggregate rebuilds replace one calculation version atomically and do not accumulate rows.
- [x] Events outside the manifest market and unsupported borrow modes fail closed.
- [x] Read-only current-state and inclusive time-range commands return bigint values as decimal strings.
- [x] Clean migrations pass in the deterministic PostgreSQL-compatible engine.
- [x] Recorded fixtures reproduce exact hourly totals and both principal-effect paths.
- [x] Direct pinned archive-RPC reads reproduce the committed authoritative state.
- [x] Real PostgreSQL snapshot uniqueness, conflicts, rebuilds, and reads pass.
- [x] Clean PostgreSQL migration + live backfill + snapshot + aggregate smoke test passes.
- [x] Full Phase 0-3 local regression and Phase 2 idempotency regression pass from the final tree.
- [x] Independent protocol, data-integrity, tests, and code review approves the implementation locally.
- [x] GitHub Actions passes on the final Phase 3 implementation commit.

## Evidence to date

### Unit and fixture tests

```text
Test Files  15 passed
Tests       86 passed
```

Coverage includes exact UTC bucketing, flow math, zero utilization, exact half-up utilization, underlying and aToken repayment paths, liquidation asset-side selection, unsupported borrow modes, out-of-market events, CLI validation, finalized-block rejection, snapshot provenance, current PoolAddressesProvider registry and ProtocolDataProvider back-reference validation, and exact totals for all five recorded events.

### Default integrations

```text
Test Files  2 passed | 5 skipped
Tests       5 passed | 10 skipped
```

Deterministic restart/idempotency and clean portable migrations passed. Network and real-PostgreSQL tests are explicit opt-ins and are accurately reported as skipped.

### Live archive RPC

```text
RUN_NETWORK_INTEGRATION_TESTS=true npm run test:integration
Test Files  5 passed | 2 skipped
Tests       8 passed | 7 skipped
```

Pinned discovery, overlapping Phase 2 backfill, and the new authoritative pinned snapshot passed. The snapshot exactly reproduced the manifest's physical and virtual liquidity, hToken supply, variable debt, raw rates, indexes, deficit, block hash, implementation, current provider registry entry, addresses-provider back-reference, and remaining contract relationships.

### Independent review

The mandatory independent review approved the local implementation with no remaining code or specification blocker. Review findings fixed before approval were current provider-registry validation, the provider addresses-provider back-reference, complete block timestamp conflict detection, the documented archive-RPC fallback, evidence counts, README scope wording, and the CI job label.

### GitHub Actions and PostgreSQL 17

Implementation commit `7124f09` passed [GitHub Actions run 29286498822](https://github.com/ktabes/usdc-market-watch/actions/runs/29286498822):

```text
Unit/fixture test files  15 passed
Unit/fixture tests       86 passed
Integration test files   7 passed
Integration tests        15 passed
```

The integration total includes all six real-PostgreSQL tests, PostgreSQL connectivity, clean portable migrations, the Phase 2 memory and overlapping live-network idempotency paths, pinned discovery, the authoritative snapshot, and the combined clean migration + live backfill + snapshot + aggregate rebuild smoke path.

## Gate result

Phase 3 is approved. Railway production migrations and historical backfill were intentionally not applied during the code gate and remain a separate operator action. Phase 4 may begin as a separately scoped change.
