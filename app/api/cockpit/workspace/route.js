import { canAccess, readSession } from '../../../../lib/auth';
import { cockpitWorkspace } from '../../../../lib/workspace/cockpit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const session = readSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401, headers: { 'cache-control': 'private, no-store' } });
  if (!canAccess(session, 'toki') && !canAccess(session, 'automations')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = cockpitWorkspace(process.env, session);
  if (!canAccess(session, 'toki')) {
    body.xero = { state: 'hidden' };
    body.sheets = { state: 'hidden' };
    body.clickup = { state: 'hidden' };
  }
  delete body.jrl;
  body.jrlIncluded = false;
  return Response.json(body, { headers: { 'cache-control': 'private, no-store' } });
}
