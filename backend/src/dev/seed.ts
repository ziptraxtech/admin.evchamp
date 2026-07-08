// Seed a demo org/station/price-group/charger so you can test immediately.
// Run once: npm run seed
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { organizations, stations, priceGroups, chargers, connectors } from '../db/schema.js';

async function seed() {
  const existing = await db.query.chargers.findFirst({ where: eq(chargers.chargeboxId, '0001') });
  if (existing) { console.log('Already seeded.'); process.exit(0); }

  const [org] = await db.insert(organizations).values({ name: 'EvChamp' }).returning();
  const [station] = await db.insert(stations).values({
    orgId: org.id, name: 'CharjKaro · Andheri Hub', address: 'Andheri, Mumbai',
  }).returning();
  const [pg] = await db.insert(priceGroups).values({
    orgId: org.id, name: 'Zipbolt', pricePerKwh: '15.00', gstPct: '18.00', txnPct: '2.00',
    chargesBearer: 'customer', minRecharge: '300.00',
  }).returning();
  const [charger] = await db.insert(chargers).values({
    chargeboxId: '0001', stationId: station.id, status: 'offline',
  }).returning();
  await db.insert(connectors).values([
    { chargerId: charger.id, connectorNo: 1, name: 'CN1', connectorType: 'Type 6', powerKw: '3.00', voltageV: '48.00', priceGroupId: pg.id, status: 'unavailable' },
    { chargerId: charger.id, connectorNo: 2, name: 'CN2', connectorType: 'Type 7', powerKw: '3.00', voltageV: '48.00', priceGroupId: pg.id, status: 'unavailable' },
  ]);

  console.log('Seeded: 0001 (connectors 1 & 2), price group Zipbolt ₹15/kWh.');
  process.exit(0);
}
seed().catch((e) => { console.error(e); process.exit(1); });
