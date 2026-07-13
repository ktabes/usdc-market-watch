import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export type DatabaseClient = postgres.Sql;

export function createDatabase(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    max: 10,
    prepare: false,
  });

  return {
    client,
    database: drizzle(client),
  };
}
