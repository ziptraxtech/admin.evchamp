// Usage: npm run create-cpo -- --userId zipbolt --password secret123 --company "Zipbolt EV"
// Creates a login_cpo row linked to a matching (or new) organization.

import '../env.js';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { organizations, loginCpo } from '../db/schema.js';

const args = process.argv.slice(2);
const get  = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };

const userId      = get('--userId')   || get('--user-id');
const password    = get('--password') || get('--pass');
const companyName = get('--company');

if (!userId || !password || !companyName) {
  console.error('Usage: npm run create-cpo -- --userId <id> --password <pass> --company "<Name>"');
  process.exit(1);
}

const existing = await db.query.loginCpo.findFirst({ where: eq(loginCpo.userId, userId) });
if (existing) { console.error(`CPO userId "${userId}" already exists.`); process.exit(1); }

// Reuse existing org with same name, or create a new one
let org = await db.query.organizations.findFirst({ where: eq(organizations.name, companyName) });
if (!org) {
  [org] = await db.insert(organizations).values({ name: companyName }).returning();
  console.log(`Created organization: ${org.name} (${org.id})`);
} else {
  console.log(`Using existing organization: ${org.name} (${org.id})`);
}

const passwordHash = await bcrypt.hash(password, 12);
await db.insert(loginCpo).values({ userId, passwordHash, companyName, orgId: org.id });

console.log(`✓ CPO created — userId: "${userId}", company: "${companyName}"`);
console.log(`  orgId: ${org.id}`);
process.exit(0);
