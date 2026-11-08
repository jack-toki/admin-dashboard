import { registerWorkflow } from '../../../../lib/automations/registry';
import { ZAPIER_ONBOARDING } from '../../../../lib/automations/coverage';
import { readSession } from '../../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const memory = new Map();

export async function POST(req) {
  const session = readSession(req);
  const secret = req.headers.get('x-toki-secret') || '';
  const secretOk = Boolean(process.env.INGEST_SECRET) && secret === process.env.INGEST_SECRET;
  if (!session && !secretOk) return Response.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const result = registerWorkflow({ get: (key) => memory.get(key) || null, set: (key, value) => memory.set(key, value) }, body);
  if (!result.ok) return Response.json(result, { status: 400 });
  return Response.json({
    ...result,
    persisted: 'process_memory',
    durable: false,
    zapier: ZAPIER_ONBOARDING,
  });
}
