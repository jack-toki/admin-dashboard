import { canAccess, readSession } from '../../../../lib/auth';
import { validateEntry } from '../../../../lib/planning/entries';
import { openAppStore } from '../../../../lib/store/index';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function denied(session) {
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  if (!canAccess(session, 'toki')) return Response.json({ error: 'forbidden' }, { status: 403 });
  return null;
}

function unavailable(opened) {
  if (opened.ok) return null;
  return Response.json({
    ok: false,
    error: 'store_not_configured',
    missing: opened.status.missing,
    durable: false,
  }, { status: 503 });
}

export async function GET(req) {
  const session = readSession(req);
  const block = denied(session);
  if (block) return block;
  const opened = openAppStore();
  const closed = unavailable(opened);
  if (closed) return closed;
  const entries = await opened.store.listPlans();
  return Response.json({
    ok: true,
    backend: opened.status.backend,
    shared: opened.status.shared === true,
    entries,
  }, { headers: { 'cache-control': 'private, no-store' } });
}

export async function POST(req) {
  const session = readSession(req);
  const block = denied(session);
  if (block) return block;
  const opened = openAppStore();
  const closed = unavailable(opened);
  if (closed) return closed;
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const pounds = Number(body.amount);
  const result = validateEntry({
    ...body,
    amountMinor: Number.isFinite(pounds) ? Math.round(pounds * 100) : body.amountMinor,
  });
  if (!result.ok) return Response.json({ ok: false, errors: result.errors }, { status: 400 });
  result.entry.provenance = body.provenance === 'scenario' ? 'scenario' : 'manual_plan';
  const saved = await opened.store.savePlan(result.entry);
  return Response.json({ ok: true, shared: opened.status.shared === true, entry: saved }, { status: 201 });
}
