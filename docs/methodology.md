# Methodology

## Objective

Build a traceable data system for one USDC core lending market on HyperLend / HyperEVM. Every later value should be reproducible from raw onchain evidence or a pinned contract read. Correctness and diagnosability take priority over feature breadth.

## Phase-gate policy

Work proceeds one phase at a time. A phase is complete only when:

1. Its acceptance criteria are met.
2. New automated tests pass.
3. The entire regression suite passes.
4. An independent reviewer checks the implementation against the specification.
5. Findings, fixes, command output, and limitations are recorded under `docs/evidence/`.

Phase 0 creates guardrails only. Phase 1 must verify the market manifest before indexing. Work stops again after Phase 4 for owner review before any interface work.

## Phase 0 decisions

### Runtime and dependency policy

- Node.js 22 is the minimum supported runtime.
- npm and the committed lockfile provide reproducible installs.
- Production code uses ECMAScript modules and strict TypeScript.
- Runtime dependencies are kept separate from developer tooling.

### Configuration

All operational values enter through validated environment configuration. Validation reports all problems at once, does not echo credential values, and converts bounded integer settings exactly once at startup. Contract addresses are absent in Phase 0 and must not be embedded in later indexer logic.

### PostgreSQL and migrations

PostgreSQL is the durable store and Drizzle is the schema/migration layer. A neutral metadata table proves the pipeline without prematurely designing Phase 2–4 domain tables. Committed migrations are append-only after shared use.

The portable integration test applies migration SQL to a clean embedded PostgreSQL engine. The opt-in real integration test and CI use the same `postgres.js`/Drizzle path as production.

### Financial precision

Phase 0 does not calculate financial values. Later phases must keep token amounts and fixed-point rates as `bigint` in application code and exact integer or numeric representations in PostgreSQL. JavaScript `number` is limited to bounded operational settings such as chain ID, confirmation count, and block-range size.

### Secrets and private data

Environment files, key material, local databases, and the designated `.private/` owner-input directory are excluded. Owner-supplied transaction CSVs and wallet exports belong only in that directory. An automated scanner catches tracked environment files, common sensitive filenames, and private-key content elsewhere. Public contract addresses and intentionally selected public transaction hashes may be committed only with provenance in later phases.

### Test layers

- Unit tests: deterministic configuration behavior and pure logic.
- Portable integration tests: clean migration application without a service dependency.
- Real PostgreSQL integration tests: actual network driver, migrations, connectivity, and basic reads.
- CI: clean Linux checkout, Node 22, PostgreSQL 17, migration command, and the complete check suite.

Phase 1 records real network logs as immutable fixture inputs so decoding remains deterministic. A separate opt-in pinned-block integration test reproduces the live contract reads without making the fixture suite network-dependent.

## Phase 1 protocol specification

The authoritative address relationships, ABI provenance, normalized event contract, units, formulas, rounding policy, and recorded fixtures are defined in the [Phase 1 protocol specification](protocol/phase-1-specification.md). Source precedence is pinned-block state first, then onchain registries and back-references, then official documentation candidates. The HyperLend HTTP API is secondary and is not required for discovery or correctness.

## Evidence conventions

Evidence records include the date, repository state, exact commands, pass/fail/skip counts, review findings, fixes, and known limitations. A skipped external integration is never described as a pass. Live or network-derived evidence must identify its pinned block or observation time when introduced in later phases.
