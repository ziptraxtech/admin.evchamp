// A simulated OCPP 1.6 charger — lets you test the whole loop with no hardware.
// Run (after the backend is up): npm run fake-charger
// Auto-reconnects if the backend restarts, and reports connector status live.

import WebSocket from 'ws';
import { parse, buildResult, buildCall } from '../ocpp/messages.js';
import { config } from '../config.js';

// id can be passed: `npm run fake-charger -- 0001`  (or CHARGEBOX env)
const CHARGEBOX = process.argv[2] || process.env.CHARGEBOX || '0001';
let ws: WebSocket;
const sent = new Map<string, string>();
let meterWh = 1000;
let txnId: number | null = null;
let meterTimer: NodeJS.Timeout | null = null;
let activeConnector = 1;

const send = (action: string, payload: any) => {
  const { id, frame } = buildCall(action, payload);
  sent.set(id, action);
  ws.send(frame);
};
const status = (connectorId: number, s: string) =>
  send('StatusNotification', { connectorId, status: s, errorCode: 'NoError' });

function connect() {
  ws = new WebSocket(`ws://localhost:${config.ocppPort}/${CHARGEBOX}`);

  ws.on('open', () => {
    console.log(`[fake] ${CHARGEBOX} connected`);
    send('BootNotification', { chargePointVendor: 'EvChamp', chargePointModel: 'Sim-1' });
    [1, 2].forEach((c) => status(c, 'Available'));
    setInterval(() => ws.readyState === WebSocket.OPEN && send('Heartbeat', {}), 30_000);
  });

  ws.on('message', (data) => {
    const msg = parse(data.toString());
    if (!msg) return;

    if (msg.type === 'CALLRESULT') {
      if (sent.get(msg.id) === 'StartTransaction') {
        txnId = msg.payload.transactionId;
        console.log(`[fake] StartTransaction accepted, txnId=${txnId} — metering…`);
        status(activeConnector, 'Charging');
        meterTimer = setInterval(() => {
          meterWh += 2000;
          send('MeterValues', {
            connectorId: activeConnector, transactionId: txnId,
            meterValue: [{ timestamp: new Date().toISOString(),
              sampledValue: [{ value: String(meterWh), measurand: 'Energy.Active.Import.Register', unit: 'Wh' }] }],
          });
        }, 1000);
      }
      sent.delete(msg.id);
      return;
    }

    if (msg.type === 'CALL') {
      if (msg.action === 'RemoteStartTransaction') {
        activeConnector = msg.payload.connectorId ?? 1;
        ws.send(buildResult(msg.id, { status: 'Accepted' }));
        console.log(`[fake] RemoteStart connector ${activeConnector} — starting in 1s`);
        setTimeout(() => send('StartTransaction', {
          connectorId: activeConnector, idTag: msg.payload.idTag,
          meterStart: meterWh, timestamp: new Date().toISOString(),
        }), 1000);
      } else if (msg.action === 'RemoteStopTransaction') {
        ws.send(buildResult(msg.id, { status: 'Accepted' }));
        if (meterTimer) clearInterval(meterTimer);
        send('StopTransaction', { transactionId: txnId, meterStop: meterWh, timestamp: new Date().toISOString(), reason: 'Remote' });
        status(activeConnector, 'Available');
        console.log(`[fake] Stopped. final meter=${meterWh} Wh`);
        txnId = null;
      } else {
        ws.send(buildResult(msg.id, {}));
      }
    }
  });

  ws.on('close', () => {
    if (meterTimer) clearInterval(meterTimer);
    console.log('[fake] disconnected — reconnecting in 2s');
    setTimeout(connect, 2000);
  });
  ws.on('error', (e) => console.error('[fake] error', e.message));
}

connect();
