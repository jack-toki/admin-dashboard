import { validateEvent } from '../../../../lib/automations/events';
import { readSession } from '../../../../lib/auth';
import { openAppStore } from '../../../../lib/store/index';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorised(req) {
  const secret = req.headers.get('x-toki-secret') || '';
  if (process.env.INGEST_SECRET && secret === process.env.INGEST_SECRET) return true;
  return Boolean(readSession(req));
}

export async function POST(req) {
  if (!authorised(req)) return Response.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  const opened = openAppStore();
  if (!opened.ok) {
    return Response.json({ ok: false, error: 'store_not_configured', missing: opened.status.missing, durable: false }, { status: 503 });
  }
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const valid = validateEvent(body);
  if (!valid.ok) return Response.json({ ok: false, errors: valid.errors }, { status: 400 });
  const event = {
    contract: 'toki.automation.event.v1',
    accountSlug: String(body.accountSlug).trim(),
    zapId: String(body.zapId).trim(),
    zapTitle: body.zapTitle ? String(body.zapTitle) : null,
    runId: body.runId ? String(body.runId) : null,
    eventId: String(body.eventId).trim(),
    stageId: body.stageId ? String(body.stageId) : null,
    attempt: Number(body.attempt ?? 1),
    status: body.status,
    occurredAt: body.occurredAt || null,
  };
  const result = await opened.store.insertEvent(event);
  return Response.json({
    ok: true,
    deduped: result.deduped,
    durable: true,
    shared: opened.status.shared === true,
    backend: opened.status.backend,
    uniqueRunKnown: Boolean(event.runId),
  });
}
