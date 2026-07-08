// EvChamp Pay — database schema (Drizzle ORM + NeonDB / Postgres)
// Each table maps to a real-world concept from the system we designed:
// chargers speak OCPP, connectors carry QR identity, price groups hold the
// GST/transaction rates, sessions track energy, payments track money + refunds.

import { relations } from 'drizzle-orm';
import {
  pgTable, pgEnum, uuid, varchar, text, integer,
  numeric, timestamp, boolean, doublePrecision, unique,
} from 'drizzle-orm/pg-core';

/* ----------------------------------------------------------------------------
 * Enums — constrained sets of values (Postgres enforces these at the DB level)
 * ------------------------------------------------------------------------- */
export const userRole       = pgEnum('user_role', ['super_admin', 'cpo', 'operator']);
export const chargesBearer  = pgEnum('charges_bearer', ['customer', 'operator']);
export const chargerKind    = pgEnum('charger_kind', ['AC', 'DC']);
export const priceType      = pgEnum('price_type', ['fixed', 'variable']);

// OCPP charger connectivity (driven by BootNotification / Heartbeat)
export const chargerStatus  = pgEnum('charger_status', ['online', 'offline', 'faulted']);

// OCPP connector state (driven by StatusNotification)
export const connectorStatus = pgEnum('connector_status', [
  'available', 'preparing', 'charging', 'faulted', 'unavailable',
]);

// Session lifecycle — encodes our "verify before consume" + stop rules
export const sessionStatus = pgEnum('session_status', [
  'pending_start',     // payment captured, RemoteStartTransaction sent, awaiting StartTransaction
  'charging',          // StartTransaction confirmed, MeterValues flowing
  'completed',         // stopped after paid energy delivered
  'stopped_early',     // driver stopped / car full before budget
  'failed_to_start',   // charger offline/faulted/rejected/timeout -> full refund
]);

// Payment lifecycle — capture -> commit -> settle/refund
export const paymentStatus = pgEnum('payment_status', [
  'created', 'captured', 'committed', 'settled', 'refunded', 'failed',
]);

export const paymentProvider = pgEnum('payment_provider', ['razorpay', 'paytm', 'upi']);

/* ----------------------------------------------------------------------------
 * Tenancy & people
 * ------------------------------------------------------------------------- */
export const organizations = pgTable('organizations', {
  id:        uuid('id').primaryKey().defaultRandom(),
  name:      varchar('name', { length: 160 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// CPO login accounts — one row per company (Zipbolt, CharjKaro, …).
// Insert via `npm run create-cpo` (not manually — password is bcrypt-hashed).
export const loginCpo = pgTable('login_cpo', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       varchar('user_id', { length: 80 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  companyName:  varchar('company_name', { length: 160 }).notNull(),
  orgId:        uuid('org_id').references(() => organizations.id).notNull(),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  orgId:        uuid('org_id').references(() => organizations.id).notNull(),
  name:         varchar('name', { length: 160 }).notNull(),
  email:        varchar('email', { length: 200 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role:         userRole('role').notNull().default('operator'),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// EV drivers — captured from the pay page (email required, phone optional)
export const drivers = pgTable('drivers', {
  id:        uuid('id').primaryKey().defaultRandom(),
  email:     varchar('email', { length: 200 }).notNull(),
  phone:     varchar('phone', { length: 20 }),               // optional
  name:      varchar('name', { length: 160 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/* ----------------------------------------------------------------------------
 * Sites, chargers, connectors
 * ------------------------------------------------------------------------- */
export const stations = pgTable('stations', {
  id:        uuid('id').primaryKey().defaultRandom(),
  orgId:     uuid('org_id').references(() => organizations.id).notNull(),
  name:      varchar('name', { length: 160 }).notNull(),
  address:   text('address'),
  lat:       doublePrecision('lat'),
  lng:       doublePrecision('lng'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const priceGroups = pgTable('price_groups', {
  id:            uuid('id').primaryKey().defaultRandom(),
  orgId:         uuid('org_id').references(() => organizations.id).notNull(),
  name:          varchar('name', { length: 120 }).notNull(),       // e.g. "Zipbolt"
  description:   text('description'),
  priceType:     priceType('price_type').notNull().default('fixed'),
  currency:      varchar('currency', { length: 3 }).notNull().default('INR'),
  gateway:       paymentProvider('gateway').notNull().default('razorpay'),
  pricePerKwh:   numeric('price_per_kwh', { precision: 10, scale: 2 }).notNull(),   // ₹15.00
  gstPct:        numeric('gst_pct', { precision: 5, scale: 2 }).notNull().default('18.00'),
  txnPct:        numeric('txn_pct', { precision: 5, scale: 2 }).notNull().default('2.00'),
  chargesBearer: chargesBearer('charges_bearer').notNull().default('customer'),
  minRecharge:   numeric('min_recharge', { precision: 10, scale: 2 }).notNull().default('300.00'),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const chargers = pgTable('chargers', {
  id:            uuid('id').primaryKey().defaultRandom(),
  // chargeboxId is the OCPP identity the charger connects with (wss://.../{chargeboxId})
  chargeboxId:   varchar('chargebox_id', { length: 80 }).notNull().unique(),
  name:          varchar('name', { length: 120 }),
  stationId:     uuid('station_id').references(() => stations.id).notNull(),
  chargerKind:   chargerKind('charger_kind').notNull().default('AC'),  // AC / DC
  isPublic:      boolean('is_public').notNull().default(true),
  ocppProtocol:  varchar('ocpp_protocol', { length: 20 }).notNull().default('ocpp1.6'),
  status:        chargerStatus('status').notNull().default('offline'),
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const connectors = pgTable('connectors', {
  id:            uuid('id').primaryKey().defaultRandom(),
  chargerId:     uuid('charger_id').references(() => chargers.id).notNull(),
  connectorNo:   integer('connector_no').notNull(),          // 1, 2, 3 ... (OCPP connectorId)
  name:          varchar('name', { length: 120 }),
  connectorType: varchar('connector_type', { length: 40 }),  // Type 6 / Type 7 / CCS2
  powerKw:       numeric('power_kw', { precision: 6, scale: 2 }),
  voltageV:      numeric('voltage_v', { precision: 6, scale: 2 }),
  priceGroupId:  uuid('price_group_id').references(() => priceGroups.id),
  status:        connectorStatus('status').notNull().default('unavailable'),
}, (t) => ({
  // one row per (charger, connector number)
  uniqConnector: unique('uniq_charger_connector').on(t.chargerId, t.connectorNo),
}));

/* ----------------------------------------------------------------------------
 * RFID tags (driver ↔ tag, like ACS)
 * ------------------------------------------------------------------------- */
export const rfidTags = pgTable('rfid_tags', {
  id:        uuid('id').primaryKey().defaultRandom(),
  token:     varchar('token', { length: 80 }).notNull().unique(),
  driverId:  uuid('driver_id').references(() => drivers.id),
  blocked:   boolean('blocked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/* ----------------------------------------------------------------------------
 * Charging sessions — the OCPP transaction record
 * ------------------------------------------------------------------------- */
export const chargingSessions = pgTable('charging_sessions', {
  id:               uuid('id').primaryKey().defaultRandom(),
  connectorId:      uuid('connector_id').references(() => connectors.id).notNull(),
  driverId:         uuid('driver_id').references(() => drivers.id),
  ocppTransactionId: integer('ocpp_transaction_id'),         // assigned on StartTransaction
  idTag:            varchar('id_tag', { length: 80 }),       // idTag used for RemoteStart
  startMeterWh:     integer('start_meter_wh'),               // meter reading at StartTransaction
  endMeterWh:       integer('end_meter_wh'),                 // meter reading at StopTransaction
  kwh:              numeric('kwh', { precision: 10, scale: 3 }).default('0'),  // delivered
  paidKwh:          numeric('paid_kwh', { precision: 10, scale: 3 }).notNull(), // budget
  status:           sessionStatus('status').notNull().default('pending_start'),
  stopReason:       varchar('stop_reason', { length: 60 }),  // budget / driver / EVDisconnected / fault
  startedAt:        timestamp('started_at', { withTimezone: true }),
  stoppedAt:        timestamp('stopped_at', { withTimezone: true }),
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/* ----------------------------------------------------------------------------
 * Payments — the money record, including the GST/txn breakdown + refund
 * (mirrors exactly the pay-page breakdown: base + GST + txn = total)
 * ------------------------------------------------------------------------- */
export const payments = pgTable('payments', {
  id:           uuid('id').primaryKey().defaultRandom(),
  sessionId:    uuid('session_id').references(() => chargingSessions.id),
  connectorId:  uuid('connector_id').references(() => connectors.id).notNull(),
  driverId:     uuid('driver_id').references(() => drivers.id),
  provider:     paymentProvider('provider').notNull().default('razorpay'),
  // idempotency: the gateway's payment id — UNIQUE so retried webhooks can't double-process
  providerRef:  varchar('provider_ref', { length: 120 }).unique(),
  baseAmount:   numeric('base_amount', { precision: 10, scale: 2 }).notNull(),  // energy value, e.g. 300.00
  gstAmount:    numeric('gst_amount',  { precision: 10, scale: 2 }).notNull(),  // 54.00
  txnFee:       numeric('txn_fee',     { precision: 10, scale: 2 }).notNull(),  // 7.08
  totalAmount:  numeric('total_amount',{ precision: 10, scale: 2 }).notNull(),  // 361.08
  refundAmount: numeric('refund_amount',{ precision: 10, scale: 2 }).notNull().default('0'),
  status:       paymentStatus('status').notNull().default('created'),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  settledAt:    timestamp('settled_at', { withTimezone: true }),
});

/* ----------------------------------------------------------------------------
 * Relations — let Drizzle do typed joins (db.query.chargers.findMany({ with:{connectors:true} }))
 * ------------------------------------------------------------------------- */
export const stationRelations = relations(stations, ({ many }) => ({ chargers: many(chargers) }));
export const chargerRelations = relations(chargers, ({ one, many }) => ({
  station: one(stations, { fields: [chargers.stationId], references: [stations.id] }),
  connectors: many(connectors),
}));
export const connectorRelations = relations(connectors, ({ one, many }) => ({
  charger:    one(chargers,    { fields: [connectors.chargerId],    references: [chargers.id] }),
  priceGroup: one(priceGroups, { fields: [connectors.priceGroupId], references: [priceGroups.id] }),
  sessions:   many(chargingSessions),
}));
export const sessionRelations = relations(chargingSessions, ({ one }) => ({
  connector: one(connectors, { fields: [chargingSessions.connectorId], references: [connectors.id] }),
  driver:    one(drivers,    { fields: [chargingSessions.driverId],    references: [drivers.id] }),
}));
export const paymentRelations = relations(payments, ({ one }) => ({
  session:   one(chargingSessions, { fields: [payments.sessionId], references: [chargingSessions.id] }),
  connector: one(connectors,       { fields: [payments.connectorId], references: [connectors.id] }),
  driver:    one(drivers,          { fields: [payments.driverId],   references: [drivers.id] }),
}));
export const rfidTagRelations = relations(rfidTags, ({ one }) => ({
  driver: one(drivers, { fields: [rfidTags.driverId], references: [drivers.id] }),
}));
