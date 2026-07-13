import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/client.js';

const shouldRun = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = shouldRun ? describe : describe.skip;

if (shouldRun && !databaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL or DATABASE_URL is required when RUN_DATABASE_INTEGRATION_TESTS=true',
  );
}

describeWithPostgres('real PostgreSQL connectivity', () => {
  // postgres.js connects lazily, so this placeholder is never contacted when the suite is skipped.
  const connection = createDatabase(databaseUrl ?? 'postgresql://unused:unused@127.0.0.1:1/unused');

  beforeAll(async () => {
    await migrate(connection.database, { migrationsFolder: 'drizzle' });
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it('connects, migrates, and reads the bootstrap table', async () => {
    const rows = await connection.client<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'system_metadata'
    `;

    expect(rows).toEqual([{ table_name: 'system_metadata' }]);
  });
});
