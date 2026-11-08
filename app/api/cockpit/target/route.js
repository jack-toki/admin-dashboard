import { canAccess, readSession } from '../../../../lib/auth.js';
import { COCKPIT_ACCESS, probeCockpitSchema } from '../../../../lib/store/target.js';
import { supabaseGuard } from '../../../../lib/store/index.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const session = readSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  if (!canAccess(session, 'toki')) return Response.json({ error: 'forbidden' }, { status: 403 });
  const guard = supabaseGuard();
  const probe = await probeCockpitSchema(process.env);
  return Response.json({
    ok: true,
    connected: false,
    target: guard.target,
    access: {
      schema: COCKPIT_ACCESS.schema,
      schemaRoute: COCKPIT_ACCESS.schemaRoute,
      header: 'Accept-Profile',
      probed: probe.probed,
      schemaExposed: probe.schemaExposed,
      reachable: probe.reachable,
      probeCode: probe.code,
    },
  }, { headers: { 'cache-control': 'private, no-store' } });
}
