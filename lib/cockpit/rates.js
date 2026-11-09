import { canAccess, readSession } from '../auth.js';
import { openAppStore } from '../store/index.js';

const headers = { 'cache-control': 'private, no-store' };

function denied(req, env) {
  const session = readSession(req, env);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401, headers });
  if (!canAccess(session, 'automations') && !canAccess(session, 'toki')) {
    return Response.json({ error: 'forbidden' }, { status: 403, headers });
  }
  return null;
}

export async function readRateRows(env = process.env) {
  try {
    const opened = openAppStore(env);
    if (!opened.ok || typeof opened.store.listRates !== 'function') return [];
    const rows = await opened.store.listRates();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function ratesGet(req, deps = {}) {
  const env = deps.env || process.env;
  const block = denied(req, env);
  if (block) return block;
  const opened = (deps.openAppStore || openAppStore)(env);
  if (!opened.ok || typeof opened.store.listRates !== 'function') {
    return Response.json({ ok: true, stored: false, rows: [] }, { headers });
  }
  const rows = await opened.store.listRates();
  if (rows?.error) return Response.json({ ok: true, stored: false, rows: [] }, { headers });
  return Response.json({ ok: true, stored: true, rows }, { headers });
}

export async function ratesPut(req, deps = {}) {
  const env = deps.env || process.env;
  const block = denied(req, env);
  if (block) return block;
  const opened = (deps.openAppStore || openAppStore)(env);
  if (!opened.ok || typeof opened.store.saveRate !== 'function') {
    return Response.json({ ok: false, stored: false, error: 'rates_store_not_ready' }, { status: 409, headers });
  }
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const kind = body.kind === 'zap' ? 'zap' : body.kind === 'client' ? 'client' : null;
  if (!kind || !body.id) return Response.json({ ok: false, error: 'invalid' }, { status: 400, headers });
  const row = kind === 'client'
    ? { id: `client:${body.id}`, kind, hourlyRateMinor: Math.round(Number(body.hourlyRate) * 100), minutesPerRun: null }
    : { id: `zap:${body.id}`, kind, hourlyRateMinor: null, minutesPerRun: Number(body.minutes) };
  if (kind === 'client' && !(row.hourlyRateMinor > 0)) return Response.json({ ok: false, error: 'invalid' }, { status: 400, headers });
  if (kind === 'zap' && !(row.minutesPerRun > 0 && row.minutesPerRun <= 240)) return Response.json({ ok: false, error: 'invalid' }, { status: 400, headers });
  const saved = await opened.store.saveRate(row);
  if (saved?.error) return Response.json({ ok: false, stored: false, error: saved.error }, { status: 409, headers });
  return Response.json({ ok: true, stored: true, row }, { headers });
}
