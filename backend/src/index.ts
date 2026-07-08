// Entry point — one persistent process running both halves (MVP topology).
import { startOcppServer } from './ocpp/server.js';
import { startApiServer } from './api/server.js';

// Resilience: a single bad query/request must never take down the whole server
// (which would knock both the customer site and admin console offline at once).
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

startOcppServer();   // chargers connect here (WebSocket)
startApiServer();    // pay page + payment webhook (HTTP)

console.log('[EvChamp] backend up.');
