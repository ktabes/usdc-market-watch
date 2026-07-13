# Phase 0 gate evidence

- Date: 2026-07-13
- Scope: Bootstrap and guardrails only
- Tested implementation revision: `64603de6e0bc86479b2ea38121837e7547e5ba8e`
- Public repository: <https://github.com/ktabes/usdc-market-watch>
- Gate status: **APPROVED — implementation, PostgreSQL CI, and independent review passed**

## Acceptance criteria

- [x] TypeScript/Node repository, npm lockfile, linting, formatting, type checking, test runner, build, and CI are defined.
- [x] Required `test`, `test:unit`, `test:integration`, `lint`, `typecheck`, and `check` commands exist.
- [x] Local PostgreSQL and Drizzle migration workflows are documented.
- [x] `.env.example` and strict, redacted startup validation exist.
- [x] Missing and malformed environment settings have unit coverage.
- [x] A deterministic clean-migration smoke test passes.
- [x] Real PostgreSQL connectivity and migration smoke tests pass in CI.
- [x] Secret and sensitive-file guardrails are automated.
- [x] Complete Phase 0 regression passes after documentation and review fixes.
- [x] Independent protocol-scope, data-integrity, test, and code review is complete.
- [x] The public GitHub repository exists and its Phase 0 CI job is green.

## Validation evidence

Authoritative GitHub Actions run:

- Run: <https://github.com/ktabes/usdc-market-watch/actions/runs/29267919991>
- Job: <https://github.com/ktabes/usdc-market-watch/actions/runs/29267919991/job/86877984208>
- Revision: `64603de6e0bc86479b2ea38121837e7547e5ba8e`
- Result: `success`
- Service: PostgreSQL 17 (`postgres:17-alpine`)

| CI step                                                     | Result                                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| Clean checkout and `npm ci`                                 | PASS                                                                        |
| `npm run db:migrate`                                        | PASS — migration and connectivity check passed                              |
| Formatting, lint, typecheck, build, and sensitive-file scan | PASS                                                                        |
| Unit tests                                                  | PASS — 1 file, 10 tests                                                     |
| Integration tests                                           | PASS — 2 files, 2 tests; PGlite migration and real PostgreSQL both executed |

Additional deterministic evidence:

| Check                                                     | Result                                                                                 |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Local `npm run check`                                     | PASS — real PostgreSQL test explicitly skipped because no local service is installed   |
| Local `git clone` of committed Phase 0 implementation     | PASS — lockfile install and deterministic checks                                       |
| `npm run db:generate -- --name=no_schema_change_expected` | PASS — `No schema changes, nothing to migrate`                                         |
| Local `.env` scanner scenario                             | PASS — ignored `.env` accepted; force-tracked `.env` rejected in reviewer reproduction |

The Drizzle ORM runtime dependency was upgraded to 0.45.2 after a registry audit identified a high-severity advisory in the earlier resolved version. A final online `npm audit` reports zero high or critical findings and four moderate development-only findings inherited through Drizzle Kit's deprecated loader. npm's offered fix is an incompatible Drizzle Kit downgrade; the latest stable Drizzle Kit release remains affected. This residual development-tool risk is accepted for Phase 0 and must be monitored.

## Independent review

The required separate reviewer checked Phase 0 across protocol/scope, data integrity, tests, code/configuration, privacy, migrations, clean-install behavior, the public remote, and live CI evidence.

Review findings and dispositions:

1. The setup guide created `.env`, while the sensitive-file scanner rejected every `.env`. Fixed: ignored local environment files pass and force-tracked environment files fail.
2. The initial hand-written migration journal omitted Drizzle's baseline snapshot. Fixed: migration 0000 and its snapshot are Drizzle-generated, and no-change generation creates no duplicate migration.
3. Personal CSV protection relied only on policy. Hardened: `.private/` is the designated ignored owner-input directory.
4. GitHub Actions v4 emitted a deprecated Node 20 runtime warning. Fixed: official current major actions are used, and the replacement run is clean.
5. The original evidence record predated the public repository and successful PostgreSQL run. Fixed in this record using the exact revision, run, job, and test counts independently verified by the reviewer.

The reviewer found no remaining code, test, data-integrity, protocol-scope, privacy, migration, repository, or CI blocker.

## Known limitations carried into Phase 1

- The current workstation does not have Docker or `psql`; local checks therefore skip the real PostgreSQL test. CI makes the real test mandatory and has passed it.
- Four moderate development-only npm advisories remain through the latest stable Drizzle Kit dependency chain. There are no known high or critical advisories.
- No protocol addresses, ABIs, RPC reads, onchain events, financial calculations, or market-specific tables exist yet. These are intentionally Phase 1 or later work.
- No public application deployment has been prepared.

## Gate decision

Phase 0 is approved. Phase 1 may begin with protocol discovery and executable specification; no indexer work may start until the Phase 1 market manifest and pinned-block verification gate passes.
