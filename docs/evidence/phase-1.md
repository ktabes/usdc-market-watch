# Phase 1 Gate Evidence

**Status:** APPROVED

**Date:** 2026-07-13

**Scope:** Protocol discovery and executable specification only. No indexing code is included.

## Acceptance checklist

- [x] Candidate Pool, reserve, hToken, variable-debt token, data provider, and oracle identified from official sources.
- [x] Pinned-block discovery emits a versioned, machine-readable manifest.
- [x] Chain, bytecode, metadata, configuration, token relationships, and required reads validate at the pinned block.
- [x] A versioned ABI subset records the official repository and exact source commit.
- [x] Five required market event types have normalized bigint-safe forms.
- [x] Five real public transaction/log fixtures record raw inputs, expected fields, and source links.
- [x] Units, formulas, rounding, assumptions, and the reconciliation-tolerance boundary are documented.
- [x] Deterministic unit and fixture suites pass.
- [x] Pinned-block network integration test passes.
- [x] Full Phase 0-1 regression passes from the final implementation tree.
- [x] Independent protocol review approves addresses, ABI provenance, event semantics, decimals, and formulas.
- [x] GitHub Actions passes on the Phase 1 implementation commit.

## Pinned evidence

- Chain ID: `999`
- Block: `40367898`
- Block hash: `0x449364485d42dc493570f3fa7b8a7bb18301bad94da88588b6bd35196c6498fe`
- Block timestamp: `1783961877`
- Manifest: `manifests/hyperlend-core-usdc-999-40367898.v1.json`
- ABI version: `hyperlend-core-7a2632a-phase1-v1`
- Core source commit: `7a2632a22ae2e620b69839f9d08fe9419df050d3`

All manifest checks are `PASS`. The manifest records contract bytecode sizes and hashes as well as address, token, reserve, oracle-unit, and state relationships. The runtime RPC URL is deliberately omitted.

## Test evidence to date

### Deterministic unit and fixture suites

```text
npm run test:unit
Test Files  7 passed (7)
Tests       45 passed (45)
```

### Complete local regression

```text
npm run check
Formatting     PASS
Lint           PASS
Type check     PASS
Build          PASS
Secret scan    PASS
Unit/fixtures  45 passed
Integration    1 passed | 2 skipped
```

The passing default integration test was the portable PostgreSQL migration. The network and real-PostgreSQL tests are deliberately opt-in and were reported as skipped, not passed, in this command.

### Network and database integration suites

Run with pinned discovery enabled and local real PostgreSQL intentionally disabled:

```text
RUN_NETWORK_INTEGRATION_TESTS=true npm run test:integration
Test Files  2 passed | 1 skipped (3)
Tests       2 passed | 1 skipped (3)
```

The passing tests were the portable PostgreSQL migration test and pinned-block market discovery. The real PostgreSQL test was explicitly skipped because `RUN_DATABASE_INTEGRATION_TESTS` was not enabled in that run; CI is configured to exercise it against PostgreSQL 17.

The first restricted-process network attempt failed at DNS resolution with `ENOTFOUND rpc.hyperlend.finance`. The same final-tree command passed with network access, so the failed attempt is recorded as an environment failure rather than a product pass.

### GitHub Actions

- Implementation commit: `3c6818fb17cf905f75cb9d261f144c77a4cd6309`
- Run: [CI 29270641560](https://github.com/ktabes/usdc-market-watch/actions/runs/29270641560)
- Result: `success`
- PostgreSQL service: `postgres:17-alpine`, PostgreSQL `17.10`
- Unit and fixture tests: `45 passed`, no skip
- Integration tests: `3 passed`, no skip
- Integration coverage: real PostgreSQL connectivity/migrations, portable PGlite migrations, and exact pinned-block discovery
- Formatting, linting, type checking, production build, and sensitive-file scan: all passed

## Findings and fixes

1. **Static Pool implementation was stale.** The documented candidate had bytecode, but the proxy's EIP-1967 slot resolved to a different active implementation. The manifest retains both and treats the pinned slot result as authoritative.
2. **Static ProtocolDataProvider was stale for the current interface.** The documented candidate lacked `POOL()`. The provider registry returned the active implementation, whose Pool and addresses-provider back-references validated. Both addresses and the resolution are retained.
3. **Manifest check ordering was initially nondeterministic.** Concurrent code reads populated the evidence array by response timing, causing byte-for-byte reproduction to fail. Discovery now performs reads concurrently but appends checks in stable candidate order. The pinned network integration test then passed exact deep equality.
4. **Initial flow semantics were too coarse.** `Supply - Withdraw` is user volume, not a sufficient hToken-supply or liquidity reconciliation formula. The specification now separately defines user supply volume, variable-debt principal, hToken principal effects, and underlying-liquidity effects, including aToken repayments and both sides/modes of liquidation.
5. **Negative validation coverage was initially insufficient.** The first tests proved only the successful pinned relationships. Tests using the production validation helpers now prove rejection of a wrong chain, mismatched provider address, wrong decimals/active state, and absent bytecode.
6. **Oracle price units were initially implicit.** Discovery now reads and persists `BASE_CURRENCY()` and `BASE_CURRENCY_UNIT()` beside the USDC price. The pinned USD base unit is `100000000`; the raw USDC price is `99972927`.
7. **A runtime RPC URL could have entered evidence.** Discovery no longer persists or prints its transport URL, and argument validation rejects userinfo, query parameters, and fragments. Documentation restricts the command to public, non-secret endpoints and explicitly prohibits path-embedded credentials.
8. **Historical mode and liquidation units needed explicit boundaries.** Variable-debt flow includes only Borrow mode 2; non-2 history is an unsupported configuration boundary. Each liquidation field uses its named asset's decimals, and USDC debt and collateral volume selectors are separate.

## Independent review

The separate reviewer approved the final implementation on 2026-07-13 with no remaining protocol, ABI, address, event, unit/formula, fixture, secret, coverage, or scope blocker. The reviewer independently reran the deterministic and pinned-network suites, compared every recorded fixture log to its archive-RPC receipt, and checked retained ABI signatures against the pinned official core source.

## Known limitations and boundary

- The manifest proves configuration at block `40367898`; upgradeable contracts can change afterward and must be rediscovered/versioned before use.
- The pinned network test depends on the public archive RPC and can fail for external availability or DNS reasons; deterministic fixtures remain network-independent.
- Real PostgreSQL was not available in the local run and was explicitly skipped there. PostgreSQL 17.10 migration/connectivity passed in CI.
- This phase defines protocol identity and semantics only. It includes no log-range planner, database event model, backfill, sync, checkpoint, or scheduler code.

## Approval

Phase 1 is approved based on the final implementation regression, exact pinned-network reproduction, green PostgreSQL-backed CI, and independent protocol/code review. Phase 2 may begin in a subsequent task; no Phase 2 work is included here.
