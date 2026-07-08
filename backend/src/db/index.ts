// DB connection for the PERSISTENT process (OCPP server + API).
// A long-running process should use a real pooled TCP connection (node-postgres)
// over Neon's POOLED connection string — not the per-request HTTP driver.
//
// NOTE: if/when the pay-page API moves to serverless (Next.js functions), use the
// Neon HTTP driver there instead:
//   import { drizzle } from 'drizzle-orm/neon-http';
//   import { neon } from '@neondatabase/serverless';
//   export const db = drizzle(neon(process.env.DATABASE_URL!), { schema });

import '../env.js'; // load .env.local/.env before reading process.env below
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export const db = drizzle(pool, { schema });
export { schema };
