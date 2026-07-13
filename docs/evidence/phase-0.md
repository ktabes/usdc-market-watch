# Phase 0 gate evidence

- Date: 2026-07-13
- Scope: Bootstrap and guardrails only
- Tested implementation revision: `6bbc9d0` (`chore: bootstrap phase 0 guardrails`)
- Gate status: **NOT YET APPROVED — external PostgreSQL/CI evidence pending**

## Acceptance criteria

- [x] TypeScript/Node repository, npm lockfile, linting, formatting, type checking, test runner, build, and CI are defined.
- [x] Required `test`, `test:unit`, `test:integration`, `lint`, `typecheck`, and `check` commands exist.
- [x] Local PostgreSQL and Drizzle migration workflows are documented.
- [x] `.env.example` and strict, redacted startup validation exist.
- [x] Missing and malformed environment settings have unit coverage.
- [x] A deterministic clean-migration smoke test passes.
- [ ] Real PostgreSQL connectivity/migration smoke test executed in CI or a configured local PostgreSQL instance.
- [x] Secret and sensitive-file guardrails are automated.
- [x] Complete Phase 0 deterministic regression passes after documentation and review fixes.
- [x] Independent protocol-scope, data-integrity, test, and code review is complete.
- [x] A literal local clone of committed revision `6bbc9d0` installs from the lockfile and passes the deterministic checks.
- [ ] GitHub repository exists and its required Phase 0 CI job is green.

## Validation evidence

Final local deterministic pass after review fixes:

| Command                                                   | Result                                                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm run check`                                           | PASS — format, lint, typecheck, build, sensitive-file scan, and tests                                        |
| `npm run test:unit`                                       | PASS — 1 file, 10 tests                                                                                      |
| `npm run test:integration`                                | PARTIAL — portable migration: 1 pass; real PostgreSQL: 1 explicit skip because no local service is installed |
| `npm run db:generate -- --name=no_schema_change_expected` | PASS — `No schema changes, nothing to migrate`                                                               |
| Local `git clone` of `6bbc9d0`                            | PASS — `npm ci --offline`; same deterministic check result                                                   |
| Local `.env` scanner scenario                             | PASS — ignored `.env` accepted; force-tracked `.env` rejected in reviewer reproduction                       |

The Drizzle ORM runtime dependency was upgraded to 0.45.2 after a registry audit identified a high-severity advisory in the earlier resolved version. A final online `npm audit` reports zero high or critical findings and four moderate development-only findings inherited through Drizzle Kit's deprecated loader. npm's offered fix is an incompatible Drizzle Kit downgrade; the latest stable Drizzle Kit release remains affected. This is recorded rather than hidden or force-fixed.

## Known limitations

- The current workstation does not have Docker or `psql`, so the real PostgreSQL suite requires CI or a separately configured database. The test is present, opt-in locally, and mandatory in CI.
- GitHub CLI authentication for the configured account is invalid and this checkout has no remote, so the new repository and CI run could not be created or observed in this phase attempt. The committed revision and a local clone are proven; the remote-hosted path is not.
- No protocol addresses, ABIs, RPC reads, onchain events, financial calculations, or market-specific tables are implemented. These are Phase 1 or later work.
- No public deployment has been prepared.

## Independent review

The required separate reviewer checked the Phase 0 implementation across protocol/scope, data integrity, tests, code/configuration, privacy, migrations, fresh-install behavior, and CI configuration.

Two initially blocking defects were reproduced and fixed:

1. The setup guide created `.env`, while the sensitive-file scanner rejected every `.env`. The scanner now permits ignored local environment files but rejects a force-tracked one.
2. The hand-written migration journal omitted Drizzle's baseline snapshot, so a subsequent generation duplicated `system_metadata`. Migration 0000 and its snapshot are now Drizzle-generated; a no-change generation produces no migration.

One low-risk defense-in-depth finding was also addressed by adding the ignored `.private/` owner-input directory for raw personal CSVs and wallet lists.

The reviewer found no remaining high-severity code defect. Protocol/scope, implemented data-integrity behavior, deterministic tests, code/configuration, and static CI configuration pass review. The reviewer did **not** approve the phase gate because neither a GitHub CI run nor a non-skipped real PostgreSQL integration run exists yet.

## Gate decision

Phase 1 remains blocked. To approve Phase 0, authenticate GitHub, create and push the neutral repository, obtain a green CI run with PostgreSQL enabled, record its revision/run URL and non-skipped database result here, and rerun the independent gate.
