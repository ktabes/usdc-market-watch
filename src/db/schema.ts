import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Phase 0 bootstrap metadata only. Domain tables are deliberately deferred to later phases.
 */
export const systemMetadata = pgTable('system_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
