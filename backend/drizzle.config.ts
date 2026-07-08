import './src/env.js';
import { defineConfig } from 'drizzle-kit';

// Migrations run against the DIRECT connection (not the pooled/PgBouncer one),
// because DDL needs a real session that the pooler doesn't support.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL!,
  },
});
