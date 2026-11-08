import { validateRegistration } from '../../../../lib/automations/registry';
import { ZAPIER_ONBOARDING } from '../../../../lib/automations/coverage';
import { readSession } from '../../../../lib/auth';
import { openAppStore } from '../../../../lib/store/index';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const session = readSession(req);
  const secret = req.headers.get('x-toki-secret') || '';
  const secretOk = Boolean(process.env.INGEST_SECRET) && secret === process.env.INGEST_SECRET;
  if (!session && !secretOk) return Response.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  const opened = openAppStore();
  if (!opened.ok) {
    return Response.json({ ok: false, error: 'store_not_configured', missing: opened.status.missing, durable: false, zapier: ZAPIER_ONBOARDING }, { status: 503 });
  }
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const valid = validateRegistration(body);
  if (!valid.ok) return Response.json({ ok: false, errors: valid.errors }, { status: 400 });
  const result = await opened.store.upsertWorkflow({
    accountSlug: String(body.accountSlug).trim(),
    zapId: String(body.zapId).trim(),
    title: String(body.title).trim(),
    accountName: body.accountName || null,
    client: body.client || null,
    owner: body.owner || null,
    zapierListener: false,
  });
  return Response.json({
    ok: true,
    created: result.created,
    durable: true,
    shared: opened.status.shared === true,
    backend: opened.status.backend,
    zapier: ZAPIER_ONBOARDING,
  });
}
