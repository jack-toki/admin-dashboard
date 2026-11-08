import { acceptEvent, createMemoryStore } from '../../../../lib/automations/events';
import { readSession } from '../../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const memory = createMemoryStore();

function authorised(req) {
  const secret = req.headers.get('x-toki-secret') || '';
  if (process.env.INGEST_SECRET && secret === process.env.INGEST_SECRET) return true;
  return Boolean(readSession(req));
}

export async function POST(req) {
  if (!authorised(req)) return Response.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const result = acceptEvent(memory, body);
  if (!result.ok) return Response.json({ ok: false, errors: result.errors }, { status: 400 });
  return Response.json({
    ok: true,
    deduped: result.deduped,
    persisted: 'process_memory',
    durable: false,
    note: 'Validated and deduped by event id in this process. Production Supabase is not written by this route.',
  });
}
