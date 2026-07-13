# Local PostgreSQL and Drizzle workflow

## Docker Compose setup

From the repository root:

```bash
cp .env.example .env
docker compose up -d postgres
docker compose ps
npm run db:migrate
RUN_DATABASE_INTEGRATION_TESTS=true npm run test:integration
```

The first container initialization creates:

- `market_watch` for local development.
- `market_watch_test` for destructive or isolated integration checks.

The named volume keeps data between container restarts. `docker compose down` stops the service without deleting data. Deleting the volume is destructive and should only be done intentionally.

## Native PostgreSQL setup

Create two databases and a least-privilege local role using the tooling appropriate to your operating system. The role needs schema creation and normal read/write privileges within those two local databases. Put the connection URLs in `.env`; do not commit that file.

Then run:

```bash
npm run db:migrate
RUN_DATABASE_INTEGRATION_TESTS=true npm run test:integration
```

## What the smoke tests prove

`migration.pglite.test.ts` applies committed SQL to a clean, deterministic PostgreSQL-compatible engine and verifies the bootstrap table. It runs without external services.

`postgres-connectivity.test.ts` uses the production `postgres.js` and Drizzle path. When explicitly enabled, it connects to `TEST_DATABASE_URL`, applies all committed migrations, and reads the migrated table. CI always enables this suite against a PostgreSQL service.

These checks cover migration syntax, connectivity, and the application driver path. They do not substitute for later phase tests of indexing, transactions, constraints, idempotency, or recovery.

## Migration rules

- Drizzle schema is declared in `src/db/schema.ts`.
- Generated, reviewed migrations live in `drizzle/` and are committed.
- Applied shared migrations are immutable.
- A clean database must be rebuildable from committed migrations alone.
- Schema changes must retain prior phase regression coverage.
