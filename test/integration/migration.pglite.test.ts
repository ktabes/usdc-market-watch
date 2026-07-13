import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = fileURLToPath(new URL('../../drizzle/', import.meta.url));

describe('committed migrations', () => {
  it('apply cleanly to a deterministic PostgreSQL engine', async () => {
    const database = new PGlite();

    try {
      const migrations = (await readdir(migrationsDirectory))
        .filter((name) => /^\d+.*\.sql$/.test(name))
        .sort();
      for (const migration of migrations) {
        await database.exec(await readFile(`${migrationsDirectory}/${migration}`, 'utf8'));
      }
      const result = await database.query<{ table_name: string }>(
        `select table_name
         from information_schema.tables
         where table_schema = 'public'
           and table_name in (
             'blocks', 'indexer_checkpoints', 'indexer_runs', 'ingestion_failures',
             'market_events', 'raw_logs', 'system_metadata'
           )
         order by table_name`,
      );

      expect(result.rows.map((row) => row.table_name)).toEqual([
        'blocks',
        'indexer_checkpoints',
        'indexer_runs',
        'ingestion_failures',
        'market_events',
        'raw_logs',
        'system_metadata',
      ]);
    } finally {
      await database.close();
    }
  });
});
