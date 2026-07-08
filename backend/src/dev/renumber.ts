// One-off: rename the demo charger from the old "CK-ANDHERI-08" to the new 4-digit
// scheme ("0001"), preserving its connectors/sessions/payments (they FK by uuid).
// Run: npx tsx src/dev/renumber.ts
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { chargers } from '../db/schema.js';

const FROM = 'CK-ANDHERI-08', TO = '0001';
const r = await db.update(chargers).set({ chargeboxId: TO }).where(eq(chargers.chargeboxId, FROM)).returning();
console.log(r.length ? `Renamed ${FROM} → ${TO}` : `No charger named ${FROM} (already renamed?)`);
process.exit(0);
