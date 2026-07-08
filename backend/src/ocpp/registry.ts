// The live socket registry — the bridge between the two halves of the backend.
//
// The OCPP server owns the WebSocket to each charger. When the PAYMENT side needs
// to start a connector, it calls registry.call(chargeboxId, 'RemoteStartTransaction', …).
// In this single-process MVP that's an in-memory Map. When you scale to multiple
// instances, replace this module with Redis pub/sub (sockets are sticky to one
// instance, so only the owner can send) — the call() signature stays the same.

import type { WebSocket } from 'ws';
import { buildCall } from './messages.js';

interface Pending { resolve: (v: any) => void; reject: (e: any) => void; timer: NodeJS.Timeout }

export interface ChargerConn {
  chargeboxId: string;
  ws: WebSocket;
  pending: Map<string, Pending>;   // uniqueId -> awaiting CALLRESULT
  txnCounter: number;              // local source of OCPP transactionIds
}

const registry = new Map<string, ChargerConn>();

export function add(chargeboxId: string, ws: WebSocket): ChargerConn {
  const conn: ChargerConn = { chargeboxId, ws, pending: new Map(), txnCounter: Date.now() % 1_000_000 };
  registry.set(chargeboxId, conn);
  return conn;
}
export function remove(chargeboxId: string) {
  const c = registry.get(chargeboxId);
  c?.pending.forEach((p) => { clearTimeout(p.timer); p.reject(new Error('charger disconnected')); });
  registry.delete(chargeboxId);
}
export const get = (chargeboxId: string) => registry.get(chargeboxId);
export const isOnline = (chargeboxId: string) => registry.has(chargeboxId);

// Resolve a pending request when its CALLRESULT/CALLERROR arrives (called by the server).
export function settle(chargeboxId: string, id: string, ok: boolean, payload: any) {
  const p = registry.get(chargeboxId)?.pending.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  registry.get(chargeboxId)!.pending.delete(id);
  ok ? p.resolve(payload) : p.reject(payload);
}

// Send a CALL to a charger and await its reply. Rejects if the charger is offline
// or doesn't answer in time — which is exactly how the start-flow detects failure.
export function call(chargeboxId: string, action: string, payload: any, timeoutMs = 30_000): Promise<any> {
  const conn = registry.get(chargeboxId);
  if (!conn) return Promise.reject(new Error('charger offline'));
  const { id, frame } = buildCall(action, payload);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      conn.pending.delete(id);
      reject(new Error(`OCPP ${action} timed out`));
    }, timeoutMs);
    conn.pending.set(id, { resolve, reject, timer });
    conn.ws.send(frame);
  });
}
