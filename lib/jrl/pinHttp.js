import { readSession, canAccess } from '../auth.js';
import { openAppStore } from '../store/index.js';
import { hashPin, pinCookie, pinMatches, signPinGrant, validPin } from './pin.js';

const headers = { 'cache-control': 'private, no-store' };

function denied(req, env) {
  const session = readSession(req, env);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401, headers });
  if (!canAccess(session, 'jrl')) return Response.json({ error: 'forbidden' }, { status: 403, headers });
  return null;
}

function storeOf(deps, env) {
  if (deps.store) return deps.store;
  const opened = (deps.openAppStore || openAppStore)(env);
  return opened.ok ? opened.store : null;
}

export async function pinStatus(req, deps = {}) {
  const env = deps.env || process.env;
  const block = denied(req, env);
  if (block) return block;
  const store = storeOf(deps, env);
  if (!store || typeof store.readAccessPin !== 'function') {
    return Response.json({ ok: true, enabled: false, stored: false }, { headers });
  }
  const pin = await store.readAccessPin();
  if (pin?.error === 'pin_store_not_ready') return Response.json({ ok: true, enabled: false, stored: false }, { headers });
  return Response.json({ ok: true, enabled: pin.enabled === true, stored: true }, { headers });
}

export async function pinSave(req, deps = {}) {
  const env = deps.env || process.env;
  const block = denied(req, env);
  if (block) return block;
  const store = storeOf(deps, env);
  if (!store || typeof store.saveAccessPin !== 'function') {
    return Response.json({ ok: false, stored: false, error: 'pin_store_not_ready' }, { status: 409, headers });
  }
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const current = await store.readAccessPin();
  if (current?.error === 'pin_store_not_ready') {
    return Response.json({ ok: false, stored: false, error: 'pin_store_not_ready' }, { status: 409, headers });
  }
  if (current?.enabled && !pinMatches(body.current || '', current.hash)) {
    return Response.json({ ok: false, error: 'pin_required' }, { status: 401, headers });
  }
  if (body.pin == null || body.pin === '') {
    const cleared = await store.saveAccessPin(null);
    if (cleared?.error) return Response.json({ ok: false, stored: false, error: cleared.error }, { status: 409, headers });
    return Response.json({ ok: true, enabled: false, stored: true }, { headers });
  }
  if (!validPin(body.pin)) return Response.json({ ok: false, error: 'pin_invalid' }, { status: 400, headers });
  const saved = await store.saveAccessPin(hashPin(body.pin));
  if (saved?.error) return Response.json({ ok: false, stored: false, error: saved.error }, { status: 409, headers });
  return Response.json({ ok: true, enabled: true, stored: true }, { headers });
}

export async function pinCheck(req, deps = {}) {
  const env = deps.env || process.env;
  const block = denied(req, env);
  if (block) return block;
  const store = storeOf(deps, env);
  if (!store || typeof store.readAccessPin !== 'function') {
    return Response.json({ ok: true, enabled: false }, { headers });
  }
  const pin = await store.readAccessPin();
  if (!pin?.enabled) return Response.json({ ok: true, enabled: false }, { headers });
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  if (!pinMatches(body.pin || '', pin.hash)) return Response.json({ ok: false, error: 'pin_invalid' }, { status: 401, headers });
  const token = signPinGrant(pin.hash, env);
  return Response.json({ ok: true, enabled: true }, { headers: { ...headers, 'set-cookie': pinCookie(token, env) } });
}
