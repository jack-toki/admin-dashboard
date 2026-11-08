import { db } from '../../../../lib/supabase';
import { handleLegacyIngest, parseLegacyBody } from '../../../../lib/automations/legacyIngest';

export const runtime = 'nodejs';

// POST /api/ingest/<account-slug>
// Header: x-toki-secret
// Legacy JSON body, or the one form-encoded AA step. Harewood may send an unfilled timestamp placeholder.
// There is no run id, so every accepted post is stored. Nothing is dropped because the zap id repeated.
export async function POST(req, { params }) {
  const { account } = await params;
  const contentType = req.headers.get('content-type') || '';
  let body = {};
  if (contentType.includes('application/x-www-form-urlencoded')) {
    body = parseLegacyBody(await req.text(), contentType);
  } else {
    try { body = await req.json(); } catch { body = {}; }
  }
  const result = await handleLegacyIngest({
    account,
    secret: req.headers.get('x-toki-secret') || '',
    configuredSecret: process.env.INGEST_SECRET,
    body,
    db: db(),
  });
  return Response.json(result.body, { status: result.status });
}
