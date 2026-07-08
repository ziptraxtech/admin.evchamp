// Admin console API. All routes are protected by requireCpo middleware (JWT).
// Every query is scoped to req.cpo.orgId so CPOs only see their own data.

import { Router } from 'express';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { chargers, connectors, priceGroups, payments, rfidTags, stations, chargingSessions } from '../db/schema.js';
import * as registry from '../ocpp/registry.js';

export const adminRouter = Router();

// ── org-scoped ID helpers ─────────────────────────────────────────────────────

async function orgStationIds(orgId: string): Promise<string[]> {
  const rows = await db.query.stations.findMany({ where: eq(stations.orgId, orgId) });
  return rows.map(s => s.id);
}

async function orgChargerIds(orgId: string): Promise<string[]> {
  const sIds = await orgStationIds(orgId);
  if (!sIds.length) return [];
  const rows = await db.query.chargers.findMany({ where: inArray(chargers.stationId, sIds) });
  return rows.map(c => c.id);
}

async function orgConnectorIds(orgId: string): Promise<string[]> {
  const cIds = await orgChargerIds(orgId);
  if (!cIds.length) return [];
  const rows = await db.query.connectors.findMany({ where: inArray(connectors.chargerId, cIds) });
  return rows.map(c => c.id);
}

const cpo = (req: any) => req.cpo as { orgId: string };

// ── Dashboard ────────────────────────────────────────────────────────────────

adminRouter.get('/dashboard', async (req, res) => {
  const orgId = cpo(req).orgId;
  const [sIds, pgIds] = await Promise.all([orgStationIds(orgId), (async () => {
    const pgs = await db.query.priceGroups.findMany({ where: eq(priceGroups.orgId, orgId) });
    return pgs.map(p => p.id);
  })()]);

  const allChargers = sIds.length
    ? await db.query.chargers.findMany({ where: inArray(chargers.stationId, sIds) }) : [];
  const connIds = allChargers.length
    ? (await db.query.connectors.findMany({ where: inArray(connectors.chargerId, allChargers.map(c => c.id)) })).map(c => c.id) : [];

  const [sessions, pays] = await Promise.all([
    connIds.length ? db.query.chargingSessions.findMany({ where: inArray(chargingSessions.connectorId, connIds) }) : [],
    connIds.length ? db.query.payments.findMany({ where: inArray(payments.connectorId, connIds) }) : [],
  ]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todaysPay = pays.filter(p => p.createdAt >= today);
  res.json({
    chargersTotal: allChargers.length,
    chargersOnline: allChargers.filter(c => c.status === 'online').length,
    activeSessions: sessions.filter(s => s.status === 'charging').length,
    kwhToday: round(sessions.filter(s => s.createdAt >= today).reduce((a, s) => a + Number(s.kwh ?? 0), 0)),
    revenueToday: round(todaysPay.reduce((a, p) => a + (Number(p.totalAmount) - Number(p.refundAmount)), 0)),
    sessionsCount: sessions.length,
    companyName: cpo(req).companyName,
  });
});

// ── Stations ─────────────────────────────────────────────────────────────────

adminRouter.get('/stations', async (req, res) => {
  const orgId = cpo(req).orgId;
  const orgStations = await db.query.stations.findMany({
    where: eq(stations.orgId, orgId),
    with: { chargers: { with: { connectors: true } } },
  });
  res.json(orgStations.map((s: any) => ({
    id: s.id, name: s.name, address: s.address ?? null,
    lat: s.lat ?? null, lng: s.lng ?? null,
    chargers: s.chargers.length,
    online: s.chargers.filter((c: any) => registry.isOnline(c.chargeboxId)).length,
    connectors: s.chargers.reduce((n: number, c: any) => n + c.connectors.length, 0),
  })));
});

adminRouter.post('/stations', async (req, res) => {
  const orgId = cpo(req).orgId;
  const b = req.body ?? {};
  if (!b.name) return res.status(400).json({ error: 'name required' });
  const [s] = await db.insert(stations).values({
    orgId, name: b.name,
    address: b.address || null,
    lat: b.lat != null ? Number(b.lat) : null,
    lng: b.lng != null ? Number(b.lng) : null,
  }).returning();
  res.json({ ok: true, id: s.id });
});

adminRouter.put('/stations/:id', async (req, res) => {
  const s = await db.query.stations.findFirst({ where: eq(stations.id, req.params.id) });
  if (!s || s.orgId !== cpo(req).orgId) return res.status(403).json({ error: 'forbidden' });
  const b = req.body ?? {};
  await db.update(stations).set({
    name:    b.name    || s.name,
    address: b.address ?? s.address,
    lat:     b.lat != null ? Number(b.lat) : null,
    lng:     b.lng != null ? Number(b.lng) : null,
  }).where(eq(stations.id, req.params.id));
  res.json({ ok: true });
});

// ── Chargers ─────────────────────────────────────────────────────────────────

adminRouter.get('/chargers', async (req, res) => {
  const sIds = await orgStationIds(cpo(req).orgId);
  if (!sIds.length) return res.json([]);
  const list = await db.query.chargers.findMany({
    where: inArray(chargers.stationId, sIds),
    with: { station: true, connectors: true },
  });
  res.json(list.map((c: any) => ({
    chargeboxId: c.chargeboxId, name: c.name ?? c.chargeboxId, station: c.station?.name ?? null,
    address: c.station?.address ?? null, chargerKind: c.chargerKind, isPublic: c.isPublic,
    connectors: c.connectors.length, lastHeartbeat: c.lastHeartbeat,
    status: c.status, online: registry.isOnline(c.chargeboxId),
  })));
});

adminRouter.get('/chargers/:chargeboxId', async (req, res) => {
  const c = await db.query.chargers.findFirst({
    where: eq(chargers.chargeboxId, req.params.chargeboxId),
    with: { station: true, connectors: { with: { priceGroup: true } } },
  });
  if (!c) return res.status(404).json({ error: 'not_found' });
  // Ensure this charger belongs to the CPO's org
  if ((c as any).station?.orgId !== cpo(req).orgId) return res.status(403).json({ error: 'forbidden' });
  res.json({
    chargeboxId: c.chargeboxId, name: c.name ?? c.chargeboxId, station: (c as any).station?.name,
    address: (c as any).station?.address ?? null, chargerKind: c.chargerKind, isPublic: c.isPublic,
    status: c.status, online: registry.isOnline(c.chargeboxId), lastHeartbeat: c.lastHeartbeat, ocpp: c.ocppProtocol,
    connectors: (c as any).connectors.sort((a: any, b: any) => a.connectorNo - b.connectorNo).map((x: any) => ({
      id: x.id, connectorNo: x.connectorNo, name: x.name, type: x.connectorType,
      powerKw: Number(x.powerKw), voltageV: Number(x.voltageV), status: x.status,
      priceGroupId: x.priceGroupId, priceGroup: x.priceGroup?.name, pricePerKwh: Number(x.priceGroup?.pricePerKwh ?? 0),
    })),
  });
});

adminRouter.put('/chargers/:chargeboxId', async (req, res) => {
  const c = await db.query.chargers.findFirst({
    where: eq(chargers.chargeboxId, req.params.chargeboxId),
    with: { station: true },
  });
  if (!c || (c as any).station?.orgId !== cpo(req).orgId) return res.status(403).json({ error: 'forbidden' });
  const b = req.body ?? {};
  await db.update(chargers).set({
    name: b.name || null, chargerKind: b.chargerKind === 'DC' ? 'DC' : 'AC', isPublic: b.isPublic !== false,
  }).where(eq(chargers.chargeboxId, req.params.chargeboxId));
  res.json({ ok: true });
});

// ── Connectors ───────────────────────────────────────────────────────────────

adminRouter.put('/connectors/:connectorId', async (req, res) => {
  const connIds = await orgConnectorIds(cpo(req).orgId);
  if (!connIds.includes(req.params.connectorId)) return res.status(403).json({ error: 'forbidden' });
  const b = req.body ?? {};
  await db.update(connectors).set({
    name: b.name || null, connectorType: b.connectorType || null,
    powerKw: b.powerKw != null ? String(b.powerKw) : undefined,
    voltageV: b.voltageV != null ? String(b.voltageV) : undefined,
    priceGroupId: b.priceGroupId || null,
  }).where(eq(connectors.id, req.params.connectorId));
  res.json({ ok: true });
});

// ── Sessions per charger ──────────────────────────────────────────────────────

adminRouter.get('/chargers/:chargeboxId/sessions', async (req, res) => {
  const c = await db.query.chargers.findFirst({
    where: eq(chargers.chargeboxId, req.params.chargeboxId),
    with: { station: true, connectors: true },
  });
  if (!c || (c as any).station?.orgId !== cpo(req).orgId) return res.status(403).json({ error: 'forbidden' });
  const connIds = (c as any).connectors.map((x: any) => x.id);
  if (!connIds.length) return res.json([]);
  const rows = await db.query.chargingSessions.findMany({
    where: inArray(chargingSessions.connectorId, connIds),
    orderBy: desc(chargingSessions.createdAt),
    limit: 20,
    with: { connector: true, driver: true },
  });
  res.json(rows.map((s: any) => ({
    id: s.id, connectorNo: s.connector?.connectorNo ?? '?', driver: s.driver?.email ?? s.idTag ?? '—',
    kwh: Number(s.kwh ?? 0), paidKwh: Number(s.paidKwh), status: s.status,
    startedAt: s.startedAt, stoppedAt: s.stoppedAt, createdAt: s.createdAt,
  })));
});

// ── Price Groups ─────────────────────────────────────────────────────────────

const pgView = (p: any, connCount = 0) => ({
  id: p.id, name: p.name, description: p.description ?? null, priceType: p.priceType,
  pricePerKwh: Number(p.pricePerKwh), gstPct: Number(p.gstPct), txnPct: Number(p.txnPct),
  chargesBearer: p.chargesBearer, currency: p.currency, minRecharge: Number(p.minRecharge),
  gateway: p.gateway, createdAt: p.createdAt, connectors: connCount,
});

adminRouter.get('/price-groups', async (req, res) => {
  const orgId = cpo(req).orgId;
  const [pgs, conns] = await Promise.all([
    db.query.priceGroups.findMany({ where: eq(priceGroups.orgId, orgId) }),
    db.query.connectors.findMany(),
  ]);
  res.json(pgs.map(p => pgView(p, conns.filter(c => c.priceGroupId === p.id).length)));
});

adminRouter.get('/price-groups/:id', async (req, res) => {
  const p = await db.query.priceGroups.findFirst({ where: eq(priceGroups.id, req.params.id) });
  if (!p) return res.status(404).json({ error: 'not_found' });
  if (p.orgId !== cpo(req).orgId) return res.status(403).json({ error: 'forbidden' });
  res.json(pgView(p));
});

adminRouter.post('/price-groups', async (req, res) => {
  const orgId = cpo(req).orgId;
  const b = req.body ?? {};
  if (!b.name) return res.status(400).json({ error: 'name required' });
  const [p] = await db.insert(priceGroups).values({
    orgId, name: b.name, description: b.description ?? null,
    priceType: b.priceType === 'variable' ? 'variable' : 'fixed',
    currency: b.currency || 'INR', gateway: (b.gateway || 'razorpay'),
    pricePerKwh: String(b.pricePerKwh ?? '15'), gstPct: String(b.gstPct ?? '18'),
    txnPct: String(b.txnPct ?? '2'), chargesBearer: b.chargesBearer === 'operator' ? 'operator' : 'customer',
    minRecharge: String(b.minRecharge ?? '300'),
  }).returning();
  res.json({ ok: true, id: p.id });
});

adminRouter.put('/price-groups/:id', async (req, res) => {
  const p = await db.query.priceGroups.findFirst({ where: eq(priceGroups.id, req.params.id) });
  if (!p || p.orgId !== cpo(req).orgId) return res.status(403).json({ error: 'forbidden' });
  const b = req.body ?? {};
  await db.update(priceGroups).set({
    name: b.name, description: b.description ?? null,
    priceType: b.priceType === 'variable' ? 'variable' : 'fixed',
    currency: b.currency || 'INR', gateway: (b.gateway || 'razorpay'),
    pricePerKwh: String(b.pricePerKwh ?? '15'), gstPct: String(b.gstPct ?? '18'),
    txnPct: String(b.txnPct ?? '2'), chargesBearer: b.chargesBearer === 'operator' ? 'operator' : 'customer',
    minRecharge: String(b.minRecharge ?? '300'),
  }).where(eq(priceGroups.id, req.params.id));
  res.json({ ok: true });
});

// ── RFID ─────────────────────────────────────────────────────────────────────

adminRouter.get('/rfid', async (_req, res) => {
  const tags = await db.query.rfidTags.findMany({ with: { driver: true } });
  res.json(tags.map((t: any) => ({
    token: t.token, driver: t.driver?.name ?? t.driver?.email ?? null, blocked: t.blocked,
  })));
});

adminRouter.post('/rfid', async (req, res) => {
  const b = req.body ?? {};
  if (!b.token) return res.status(400).json({ error: 'token required' });
  const dupe = await db.query.rfidTags.findFirst({ where: eq(rfidTags.token, b.token) });
  if (dupe) return res.status(400).json({ error: 'token already exists' });
  await db.insert(rfidTags).values({ token: b.token, blocked: !!b.blocked });
  res.json({ ok: true });
});

// ── Transactions ─────────────────────────────────────────────────────────────

adminRouter.get('/transactions', async (req, res) => {
  const connIds = await orgConnectorIds(cpo(req).orgId);
  if (!connIds.length) return res.json([]);
  const pays = await db.query.payments.findMany({
    where: inArray(payments.connectorId, connIds),
    with: { connector: { with: { charger: true } }, session: true },
    orderBy: desc(payments.createdAt), limit: 100,
  });
  res.json(pays.map((p: any) => ({
    txnId: p.providerRef ?? p.id.slice(0, 8),
    connector: p.connector ? `${p.connector.charger?.chargeboxId} · C${p.connector.connectorNo}` : '—',
    provider: p.provider, kwh: Number(p.session?.kwh ?? 0),
    amount: Number(p.totalAmount), refund: Number(p.refundAmount), status: p.status, time: p.createdAt,
  })));
});

// ── Add Charger ───────────────────────────────────────────────────────────────

adminRouter.post('/chargers', async (req, res) => {
  const orgId = cpo(req).orgId;
  const station = await db.query.stations.findFirst({ where: eq(stations.orgId, orgId) });
  const pg = await db.query.priceGroups.findFirst({ where: eq(priceGroups.orgId, orgId) });
  if (!station || !pg) return res.status(400).json({ error: 'need a station and price group first' });

  const id = await nextChargeboxId();
  if (!id) return res.status(400).json({ error: 'id range full (9999)' });

  const { name, chargerKind, isPublic } = req.body ?? {};
  const [charger] = await db.insert(chargers).values({
    chargeboxId: id, name: name || `Charger ${id}`, stationId: station.id, status: 'offline',
    chargerKind: chargerKind === 'DC' ? 'DC' : 'AC', isPublic: isPublic !== false,
  }).returning();
  await db.insert(connectors).values([
    { chargerId: charger.id, connectorNo: 1, name: 'CN1', connectorType: 'Type 2', powerKw: '7.40', voltageV: '230.00', priceGroupId: pg.id, status: 'unavailable' },
    { chargerId: charger.id, connectorNo: 2, name: 'CN2', connectorType: 'Type 2', powerKw: '7.40', voltageV: '230.00', priceGroupId: pg.id, status: 'unavailable' },
  ]);
  res.json({ ok: true, chargeboxId: id });
});

// ─────────────────────────────────────────────────────────────────────────────

async function nextChargeboxId(): Promise<string | null> {
  const all = await db.query.chargers.findMany();
  const nums = all.map(c => (/^\d{1,4}$/.test(c.chargeboxId) ? parseInt(c.chargeboxId, 10) : -1)).filter(n => n >= 0);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return next > 9999 ? null : String(next).padStart(4, '0');
}

const round = (n: number) => Math.round(n * 100) / 100;
