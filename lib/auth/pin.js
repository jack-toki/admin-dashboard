import crypto from 'crypto';
import { authenticatePassword, createPasswordVerifier, parsePasswordVerifier, PASSWORD_HASH_PARAMS } from '../auth.js';

const FOUR = /^\d{4}$/;

export function isFourDigitCode(value) {
  return FOUR.test(String(value ?? ''));
}

function usableHash(value) {
  return value && parsePasswordVerifier(value) ? String(value) : '';
}

export async function activePinHash(env = process.env, store = null) {
  if (store && typeof store.readCockpitPin === 'function') {
    const stored = await store.readCockpitPin();
    if (stored?.ok && usableHash(stored.hash)) return { hash: stored.hash, source: 'store' };
    if (stored && stored.ok === false && stored.error !== 'pin_store_not_ready') return { hash: '', source: 'store_error', error: stored.error };
  }
  const fromEnv = usableHash(env.DASHBOARD_PIN_HASH);
  if (fromEnv) return { hash: fromEnv, source: 'env' };
  return { hash: '', source: 'none' };
}

export function pinMatches(code, hash) {
  const parsed = parsePasswordVerifier(hash);
  if (!parsed || !isFourDigitCode(code)) return false;
  const derived = crypto.scryptSync(String(code), parsed.salt, PASSWORD_HASH_PARAMS.keylen, {
    N: parsed.N, r: parsed.r, p: parsed.p, maxmem: PASSWORD_HASH_PARAMS.maxmem,
  });
  return crypto.timingSafeEqual(derived, parsed.hash);
}

export function hashPin(code) {
  if (!isFourDigitCode(code)) return { ok: false, error: 'invalid_code' };
  return { ok: true, hash: createPasswordVerifier(code) };
}

export function checkCurrentSecret({ current, pinHash, env }) {
  if (pinHash) return pinMatches(current, pinHash);
  const password = authenticatePassword(current, env);
  return Boolean(password.ok && password.session?.role === 'admin');
}

export function validateNewCode({ next, confirm }) {
  if (!isFourDigitCode(next)) return { ok: false, error: 'invalid_code' };
  if (String(next) !== String(confirm)) return { ok: false, error: 'mismatch' };
  return { ok: true };
}
