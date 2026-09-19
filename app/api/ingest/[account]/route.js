import { db, accountLabel } from '../../../../lib/supabase';

export const runtime = 'nodejs';

// POST /api/ingest/<account-slug>
// Header:  x-toki-secret: <INGEST_SECRET>
// Body:    { "zap": "{{zap title}}", "zap_id": "{{zap_meta_id}}", "ts": "{{zap_meta_utc_iso}}", "counts": {"emails":3} }
// Only `zap` is pasted per Zap; zap_id + ts auto-fill; counts only for variable-send Zaps.
export async function POST(req, { params }) {
  const { account } = await params;

  if ((req.headers.get('x-toki-secret') || '') !== process.env.INGEST_SECRET) {
    return Response.json({ ok: false, error: 'bad secret' }, { status: 401 });
  }

  let body = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const row = {
    account: accountLabel(account),
    zap_id: body.zap_id ? String(body.zap_id) : null,
    zap_title: body.zap || body.zap_title || null,
    ts: body.ts ? new Date(body.ts).toISOString() : new Date().toISOString(),
    counts: body.counts && typeof body.counts === 'object' ? body.counts : null,
  };

  const { error } = await db().from('runs').insert(row);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
