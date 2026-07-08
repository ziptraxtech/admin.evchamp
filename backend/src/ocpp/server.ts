// OCPP 1.6J Central System (CSMS). Chargers dial in over WebSocket to
//   ws://host:OCPP_PORT/{chargeboxId}
// and we handle their messages + push RemoteStart/Stop back down the same socket.

import { WebSocketServer } from 'ws';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { chargers, connectors } from '../db/schema.js';
import { config } from '../config.js';
import { parse, buildResult, buildError } from './messages.js';
import * as registry from './registry.js';
import * as sessions from '../services/sessions.js';

export function startOcppServer() {
  const wss = new WebSocketServer({ port: config.ocppPort });

  wss.on('connection', async (ws, req) => {
    const chargeboxId = decodeURIComponent((req.url ?? '/').split('/').filter(Boolean).pop() ?? '');
    if (!chargeboxId) return ws.close();

    const conn = registry.add(chargeboxId, ws);
    console.log(`[OCPP] ${chargeboxId} connected`);

    ws.on('message', async (data) => {
      const msg = parse(data.toString());
      if (!msg) return;

      // Replies to commands WE sent (RemoteStart/Stop) — hand back to registry.
      if (msg.type === 'CALLRESULT') return registry.settle(chargeboxId, msg.id, true, msg.payload);
      if (msg.type === 'CALLERROR')  return registry.settle(chargeboxId, msg.id, false, msg);

      // Requests FROM the charger — answer with a CALLRESULT.
      try {
        const result = await handleCall(conn, chargeboxId, msg.action, msg.payload);
        ws.send(buildResult(msg.id, result));
      } catch (err) {
        console.error(`[OCPP] ${chargeboxId} ${msg.action} error`, err);
        ws.send(buildError(msg.id));
      }
    });

    ws.on('close', () => {
      registry.remove(chargeboxId);
      db.update(chargers).set({ status: 'offline' }).where(eq(chargers.chargeboxId, chargeboxId)).catch(() => {});
      console.log(`[OCPP] ${chargeboxId} disconnected`);
    });
  });

  console.log(`[OCPP] CSMS listening on ws://0.0.0.0:${config.ocppPort}/{chargeboxId}`);
  return wss;
}

async function handleCall(conn: registry.ChargerConn, chargeboxId: string, action: string, p: any) {
  const now = new Date();
  switch (action) {
    case 'BootNotification':
      await db.update(chargers).set({ status: 'online', lastHeartbeat: now })
        .where(eq(chargers.chargeboxId, chargeboxId));
      return { currentTime: now.toISOString(), interval: config.heartbeatIntervalSec, status: 'Accepted' };

    case 'Heartbeat':
      await db.update(chargers).set({ lastHeartbeat: now })
        .where(eq(chargers.chargeboxId, chargeboxId));
      return { currentTime: now.toISOString() };

    case 'StatusNotification': {
      // p.connectorId 0 = the charger itself; >0 = a specific connector
      const map: Record<string, any> = {
        Available: 'available', Preparing: 'preparing', Charging: 'charging',
        Faulted: 'faulted', Unavailable: 'unavailable', Finishing: 'available', SuspendedEV: 'charging',
      };
      const status = map[p.status] ?? 'unavailable';
      if (p.connectorId && p.connectorId > 0) await setConnectorStatus(chargeboxId, p.connectorId, status);
      return {};
    }

    case 'Authorize':
      return { idTagInfo: { status: 'Accepted' } };

    case 'StartTransaction': {
      // CSMS assigns the transactionId; sessions service links it to the prepaid session.
      const transactionId = ++conn.txnCounter;
      await sessions.onStartTransaction(chargeboxId, p.connectorId, p.idTag, p.meterStart ?? 0, transactionId);
      return { transactionId, idTagInfo: { status: 'Accepted' } };
    }

    case 'MeterValues': {
      const wh = extractEnergyWh(p);
      if (wh != null) await sessions.onMeterValues(chargeboxId, p.connectorId, wh);
      return {};
    }

    case 'StopTransaction':
      await sessions.onStopTransaction(p.transactionId, p.meterStop ?? null, p.reason ?? 'Local');
      return { idTagInfo: { status: 'Accepted' } };

    case 'DataTransfer':
      return { status: 'Accepted' };

    default:
      return {};
  }
}

async function setConnectorStatus(chargeboxId: string, connectorNo: number, status: any) {
  const ch = await db.query.chargers.findFirst({ where: eq(chargers.chargeboxId, chargeboxId) });
  if (!ch) return;
  await db.update(connectors).set({ status })
    .where(and(eq(connectors.chargerId, ch.id), eq(connectors.connectorNo, connectorNo)));
}

// Pull the cumulative energy register (Wh) out of a MeterValues payload.
function extractEnergyWh(p: any): number | null {
  const samples = p?.meterValue?.flatMap((mv: any) => mv.sampledValue ?? []) ?? [];
  const energy = samples.find((s: any) => (s.measurand ?? 'Energy.Active.Import.Register') === 'Energy.Active.Import.Register');
  if (!energy) return null;
  const val = Number(energy.value);
  return (energy.unit === 'kWh') ? val * 1000 : val; // normalise to Wh
}
