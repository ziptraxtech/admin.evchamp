const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api';
const ADMIN_BASE = API_BASE + '/admin';

// TEMP: login disabled while there's no deployed backend to authenticate against.
// Flip to `false` to restore the login wall (and re-enable the 401 → login redirect).
export const AUTH_DISABLED = true;

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('evchamp_token') || '';
}

function authHeaders() {
  return { 'content-type': 'application/json', 'authorization': 'Bearer ' + getToken() };
}

export function redirectToLogin() {
  if (AUTH_DISABLED) return; // login removed for now — don't bounce to the login page
  localStorage.clear();
  window.location.replace('/');
}

export async function adminGet<T = unknown>(path: string): Promise<T> {
  const r = await fetch(ADMIN_BASE + path, { headers: { 'authorization': 'Bearer ' + getToken() } });
  if (r.status === 401 && !AUTH_DISABLED) { redirectToLogin(); throw new Error('session_expired'); }
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

export async function adminSend(path: string, method: string, body?: unknown) {
  const r = await fetch(ADMIN_BASE + path, { method, headers: authHeaders(), body: JSON.stringify(body ?? {}) });
  if (r.status === 401 && !AUTH_DISABLED) { redirectToLogin(); throw new Error('session_expired'); }
  return { ok: r.ok, body: await r.json().catch(() => ({})) };
}

export async function authLogin(userId: string, password: string) {
  const r = await fetch(API_BASE + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Login failed');
  return data as { token: string; companyName: string; userId: string };
}

export const inr = (n: unknown) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtTime = (t: unknown) => t ? new Date(String(t)).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const PAY_BASE = process.env.NEXT_PUBLIC_PAY_BASE_URL || 'http://localhost:5601';
