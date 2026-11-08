import { canAccess, readSession } from '../../../../lib/auth.js';
import { COCKPIT_ACCESS } from '../../../../lib/store/target.js';
import { supabaseGuard } from '../../../../lib/store/index.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const session = readSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  if (!canAccess(session, 'toki')) return Response.json({ error: 'forbidden' }, { status: 403 });
  const guard = supabaseGuard();
  return Response.json({
    ok: true,
    connected: false,
    target: guard.target,
    access: {
      schema: COCKPIT_ACCESS.schema,
      schemaRoute: COCKPIT_ACCESS.schemaRoute,
      reachable: false,
      parentSetting: COCKPIT_ACCESS.parentSetting,
      exposureError: COCKPIT_ACCESS.exposureError,
    },
  }, { headers: { 'cache-control': 'private, no-store' } });
}
