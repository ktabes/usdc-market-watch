import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(
  new URL('../../drizzle/0000_phase0_bootstrap.sql', import.meta.url),
);

describe('Phase 0 migration', () => {
  it('applies cleanly to a deterministic PostgreSQL engine', async () => {
    const database = new PGlite();

    try {
      await database.exec(await readFile(migrationPath, 'utf8'));
      const result = await database.query<{ table_name: string }>(
        "select table_name from information_schema.tables where table_schema = 'public' and table_name = 'system_metadata'",
      );

      expect(result.rows).toEqual([{ table_name: 'system_metadata' }]);
    } finally {
      await database.close();
    }
  });
});
