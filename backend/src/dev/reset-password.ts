// Usage: npm run reset-password -- --userId zipbolt --password 'NewPass@123'
// Sets a new password (bcrypt) for an EXISTING login_cpo user.

import '../env.js';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { loginCpo } from '../db/schema.js';

const args = process.argv.slice(2);
const get  = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };

const userId   = get('--userId') || get('--user-id');
const password = get('--password') || get('--pass');

if (!userId || !password) {
  console.error("Usage: npm run reset-password -- --userId <id> --password '<newpass>'");
  process.exit(1);
}

const existing = await db.query.loginCpo.findFirst({ where: eq(loginCpo.userId, userId) });
if (!existing) { console.error(`No login_cpo user "${userId}". (Use create-cpo to make a new one.)`); process.exit(1); }

const passwordHash = await bcrypt.hash(password, 12);
await db.update(loginCpo).set({ passwordHash }).where(eq(loginCpo.userId, userId));

console.log(`✓ Password reset for userId "${userId}" (company: ${existing.companyName}).`);
process.exit(0);
