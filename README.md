# USDC Market Watch

An auditable onchain data system for the single USDC core lending market on HyperLend / HyperEVM. The project prioritizes correctness, provenance, idempotency, and recoverability over breadth or presentation.

**Phase 0 — Bootstrap and guardrails**, **Phase 1 — Protocol discovery and executable specification**, and **Phase 2 — Viable, reliable indexer** are approved. **Phase 3 — Data model and derived snapshots** is implemented and under gate review. Reconciliation and any interface remain deferred.

## Phase 0-3 contents

- TypeScript on Node.js 22 with strict compiler settings.
- npm lockfile and reproducible `npm ci` installation.
- ESLint, Prettier, Vitest, build, and sensitive-file checks.
- Validated runtime configuration with tests for missing and malformed values.
- PostgreSQL schema and versioned Drizzle migration workflow.
- Portable migration smoke test plus opt-in real PostgreSQL connectivity test.
- GitHub Actions CI backed by PostgreSQL 17.
- Local PostgreSQL setup and evidence-oriented project documentation.
- Pinned-block HyperLend USDC market discovery with fail-closed validation.
- Versioned ABI provenance, machine-readable manifest, exact bigint formulas, and five real-log fixtures.
- Fifty-block RPC range planning, bounded retry, finalized checkpoints, resumable backfill/sync, immutable raw logs, normalized events, and run/failure diagnostics.
- Rebuildable hourly flow aggregates, authoritative block-pinned market snapshots, explicit calculation provenance, and exact read-only analytics queries.

## Requirements

- Node.js 22 or newer.
- npm 10 or newer.
- PostgreSQL 17 for real database development. Docker Compose is the shortest local path, but a native PostgreSQL installation works too.

## Fresh-clone setup

```bash
npm ci
cp .env.example .env
docker compose up -d postgres
npm run db:migrate
RUN_DATABASE_INTEGRATION_TESTS=true npm run check
```

The Compose service creates both `market_watch` and `market_watch_test` on its first start. If its named volume already predates `docker/postgres-init.sql`, create the test database manually or recreate only that local development volume.

For a native PostgreSQL installation, create `market_watch` and `market_watch_test`, update both URLs in `.env`, then run the migration and check commands above.

The project also has a deterministic migration test powered by an embedded PostgreSQL engine. Therefore `npm run test:integration` remains useful when a real database is unavailable; the real connectivity suite clearly reports as skipped unless `RUN_DATABASE_INTEGRATION_TESTS=true`.

## Commands

| Command                                                    | Purpose                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `npm test`                                                 | Run unit and integration suites.                                             |
| `npm run test:unit`                                        | Run deterministic unit tests.                                                |
| `npm run test:integration`                                 | Run migration smoke tests and, when enabled, real PostgreSQL tests.          |
| `npm run lint`                                             | Run ESLint.                                                                  |
| `npm run typecheck`                                        | Type-check all source, scripts, config, and tests.                           |
| `npm run build`                                            | Compile production source to `dist/`.                                        |
| `npm run check`                                            | Run formatting, linting, type checking, build, secret checks, and all tests. |
| `npm run db:generate`                                      | Generate a migration after an intentional schema change.                     |
| `npm run db:migrate`                                       | Apply committed migrations and verify database connectivity.                 |
| `npm run db:studio`                                        | Open Drizzle Studio for local inspection.                                    |
| `npm run discover -- --block <n>`                          | Validate the market at a pinned archive block and emit its manifest.         |
| `npm run backfill -- --from-block <a> --to-block <b>`      | Index one finalized historical interval.                                     |
| `npm run sync`                                             | Resume through the current confirmation-lagged finalized head.               |
| `npm run snapshot -- --block <n>`                          | Capture authoritative market state at one finalized block.                   |
| `npm run rebuild:flows`                                    | Atomically rebuild all hourly flow buckets from immutable events.            |
| `npm run state`                                            | Read the latest exact market snapshot.                                       |
| `npm run flows -- --from-timestamp <a> --to-timestamp <b>` | Read inclusive hourly flow buckets by Unix timestamp.                        |

## Migration workflow

1. Change `src/db/schema.ts`.
2. Run `npm run db:generate` with `DATABASE_URL` configured.
3. Review the generated SQL and metadata under `drizzle/`.
4. Run `npm run db:migrate` against a clean local database.
5. Run `RUN_DATABASE_INTEGRATION_TESTS=true npm run check`.
6. Commit the schema and generated migration together.

Never edit a migration that has been applied to a shared environment. Add a new migration instead. Phase 0 contains only a neutral `system_metadata` table; domain tables belong to later phases.

## Configuration and secrets

Copy `.env.example` to `.env`. Startup fails with an aggregated, redacted error if required settings are missing or malformed. `.env`, key files, database state, and common private-wallet export names are ignored or rejected by `npm run security:check`.

Store any owner-supplied transaction CSVs or wallet lists under the ignored `.private/` directory. Do not commit personal data, credentials, private keys, or mnemonics. Later phases may commit deliberately selected public transaction hashes with minimal expected decoded data.

## Documentation

- [Methodology](docs/methodology.md)
- [Local PostgreSQL setup](docs/local-postgres.md)
- [Evidence policy](docs/evidence/README.md)
- [Phase 0 gate evidence](docs/evidence/phase-0.md)
- [Phase 1 protocol specification](docs/protocol/phase-1-specification.md)
- [Phase 1 gate evidence](docs/evidence/phase-1.md)
- [Phase 2 indexing operations](docs/indexing.md)
- [Phase 2 gate evidence](docs/evidence/phase-2.md)
- [Phase 3 analytics and snapshots](docs/analytics.md)
- [Phase 3 gate evidence](docs/evidence/phase-3.md)

## Current boundary

The versioned manifest records the verified HyperLend core-pool USDC configuration at block `40367898`; it is evidence for that pinned block, not a promise that proxy implementations never change. Phase 3 remains under gate review, so Phase 4 is blocked. Phase 5 remains blocked until the mandatory Phase 4 owner review.
