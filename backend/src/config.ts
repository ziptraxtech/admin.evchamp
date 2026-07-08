import './env.js';

// Central config + the decision toggles we agreed during design.
// These are the levers for the failure-path behaviour — change them here.
export const config = {
  httpPort: Number(process.env.HTTP_PORT ?? 3000),
  ocppPort: Number(process.env.OCPP_PORT ?? 9220),

  // --- session / refund decision toggles (from the design discussion) ---

  // How long to wait for the charger's StartTransaction after RemoteStart is
  // Accepted, before we give up and full-refund. (You said 60–90s.)
  startTimeoutMs: 90_000,

  // On a charger-failure refund, do we refund the FULL amount (operator absorbs
  // the ~2% gateway fee) or only base+GST? You leaned "absorb it" — default true.
  refundAbsorbsGatewayFee: true,

  // If MeterValues stop arriving mid-session (charger lost connectivity):
  //  'conservative'         -> bill last known reading, refund the rest
  //  'grace'                -> wait meterGraceMs for reconnection, then settle
  //  'charger_authoritative'-> trust final StopTransaction meter, settle on reconnect
  // (Still OPEN — defaulting to 'conservative'.)
  meterLossPolicy: 'conservative' as 'conservative' | 'grace' | 'charger_authoritative',
  meterGraceMs: 120_000,

  // OCPP heartbeat interval handed back to chargers (seconds)
  heartbeatIntervalSec: 300,

  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
};
