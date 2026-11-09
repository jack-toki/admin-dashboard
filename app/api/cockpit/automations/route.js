import { canAccess, readSession } from '../../../../lib/auth.js';
import { loadRunSummary } from '../../../../lib/automations/publicRuns.js';
import { db } from '../../../../lib/supabase.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'cache-control': 'private, no-store' };

export async function GET(req) {
  const session = readSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401, headers });
  if (!canAccess(session, 'automations')) return Response.json({ error: 'forbidden' }, { status: 403, headers });
  // Same credentials as /api/dashboard. public.runs is read with the service key.
  // SUPABASE_URL and SUPABASE_SERVICE_KEY. ACCOUNTS is optional display-name JSON.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return Response.json({ ok: false, error: 'run_log_not_configured', summary: null }, { status: 503, headers });
  }
  let client;
  try { client = db(); } catch { return Response.json({ ok: false, error: 'run_log_not_configured', summary: null }, { status: 503, headers }); }
  const loaded = await loadRunSummary(({ from, to, offset, pageSize }) => client
    .from('runs')
    .select('account,zap_id,zap_title,ts,counts')
    .gte('ts', from)
    .lt('ts', to)
    .order('ts', { ascending: true })
    .range(offset, offset + pageSize - 1));
  if (!loaded.ok) return Response.json({ ok: false, error: loaded.error, summary: null }, { status: 502, headers });
  return Response.json({ ok: true, period: loaded.period, summary: loaded.summary }, { headers });
}
