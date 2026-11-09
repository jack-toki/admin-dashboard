import { readSession } from '../../../../lib/auth.js';
import { activePinHash, checkCurrentSecret, hashPin, validateNewCode } from '../../../../lib/auth/pin.js';
import { openAppStore, supabaseGuard } from '../../../../lib/store/index.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function storeOrNull() {
  const opened = openAppStore();
  if (!opened.ok) return null;
  if (opened.status.backend !== 'file' && !supabaseGuard().ok) return null;
  return opened.store;
}

export async function POST(req) {
  const session = readSession(req);
  if (!session) return Response.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const store = storeOrNull();
  const current = await activePinHash(process.env, store);
  if (!checkCurrentSecret({ current: body.current, pinHash: current.hash, env: process.env })) {
    return Response.json({ ok: false, error: 'invalid_current' }, { status: 401 });
  }
  const next = validateNewCode({ next: body.next, confirm: body.confirm });
  if (!next.ok) return Response.json({ ok: false, error: next.error }, { status: 400 });
  const hashed = hashPin(body.next);
  if (!hashed.ok) return Response.json({ ok: false, error: hashed.error }, { status: 400 });
  if (!store || typeof store.saveCockpitPin !== 'function') {
    return Response.json({ ok: false, error: 'pin_store_not_ready' }, { status: 409 });
  }
  const saved = await store.saveCockpitPin(hashed.hash);
  if (!saved?.ok) return Response.json({ ok: false, error: saved?.error || 'pin_store_not_ready' }, { status: 409 });
  return Response.json({ ok: true, stored: true }, { headers: { 'cache-control': 'private, no-store' } });
}
