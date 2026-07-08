// OCPP-J 1.6 wire format helpers.
// Every message is a JSON array. The first element is the MessageTypeId:
//   CALL       = [2, uniqueId, action, payload]        (a request)
//   CALLRESULT = [3, uniqueId, payload]                (a successful reply)
//   CALLERROR  = [4, uniqueId, errCode, errDesc, errDetails]
// This is the entire OCPP-J transport — small and stable, so we frame it by hand.

import { randomUUID } from 'node:crypto';

export const CALL = 2 as const;
export const CALLRESULT = 3 as const;
export const CALLERROR = 4 as const;

export type Incoming =
  | { type: 'CALL'; id: string; action: string; payload: any }
  | { type: 'CALLRESULT'; id: string; payload: any }
  | { type: 'CALLERROR'; id: string; code: string; description: string; details: any };

export function parse(raw: string): Incoming | null {
  let arr: any;
  try { arr = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(arr)) return null;
  switch (arr[0]) {
    case CALL:       return { type: 'CALL', id: arr[1], action: arr[2], payload: arr[3] ?? {} };
    case CALLRESULT: return { type: 'CALLRESULT', id: arr[1], payload: arr[2] ?? {} };
    case CALLERROR:  return { type: 'CALLERROR', id: arr[1], code: arr[2], description: arr[3], details: arr[4] };
    default:         return null;
  }
}

export const buildCall   = (action: string, payload: any) => {
  const id = randomUUID();
  return { id, frame: JSON.stringify([CALL, id, action, payload]) };
};
export const buildResult = (id: string, payload: any) =>
  JSON.stringify([CALLRESULT, id, payload]);
export const buildError  = (id: string, code = 'InternalError', description = '') =>
  JSON.stringify([CALLERROR, id, code, description, {}]);
