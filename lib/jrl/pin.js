import crypto from 'crypto';
import { createPasswordVerifier, parsePasswordVerifier, PASSWORD_HASH_PARAMS } from '../auth.js';

const PIN = /^\d{4,8}$/;

export function validPin(pin) {
  return PIN.test(String(pin || ''));
}

export function hashPin(pin) {
  return createPasswordVerifier(String(pin));
}

export function pinMatches(pin, verifier) {
  const parsed = parsePasswordVerifier(verifier);
  if (!parsed) return false;
  const derived = crypto.scryptSync(String(pin), parsed.salt, PASSWORD_HASH_PARAMS.keylen, {
    N: PASSWORD_HASH_PARAMS.N,
    r: PASSWORD_HASH_PARAMS.r,
    p: PASSWORD_HASH_PARAMS.p,
    maxmem: PASSWORD_HASH_PARAMS.maxmem,
  });
  return crypto.timingSafeEqual(derived, parsed.hash);
}

export function pinMark(verifier) {
  return crypto.createHash('sha256').update(String(verifier || '')).digest('base64url').slice(0, 16);
}

export function signPinGrant(verifier, env = process.env, now = Date.now()) {
  if (!env.DASHBOARD_SESSION_SECRET || !verifier) return '';
  const payload = { v: 1, purpose: 'jrl-pin', mark: pinMark(verifier), exp: now + 12 * 60 * 60 * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', env.DASHBOARD_SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function pinGrantValid(token, verifier, env = process.env, now = Date.now()) {
  if (!token || !verifier || !env.DASHBOARD_SESSION_SECRET) return false;
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return false;
  const expected = crypto.createHmac('sha256', env.DASHBOARD_SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.purpose === 'jrl-pin' && payload.mark === pinMark(verifier) && payload.exp >= now;
  } catch {
    return false;
  }
}

export function pinCookie(token, env = process.env) {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  return `toki_jrl_pin=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${12 * 60 * 60}${secure}`;
}

export function readPinCookie(req) {
  const header = req.headers.get('cookie') || '';
  const match = header.match(/(?:^|;\s*)toki_jrl_pin=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}
