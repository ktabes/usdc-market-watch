import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { parseEnv } from './config/env.js';
import { createDatabase } from './db/client.js';

const env = parseEnv(process.env);
const { client, database } = createDatabase(env.databaseUrl);

try {
  await migrate(database, { migrationsFolder: 'drizzle' });
  await client`select 1 as connectivity_check`;
  console.info('Database migration and connectivity check passed.');
} finally {
  await client.end();
}
