import { canAccess, readSession } from '../auth.js';
import { jrlAuthGap } from './reader.js';
import { jrlView } from './status.js';

function gate(req) {
  const session = readSession(req);
  if (!session) return { session: null, response: Response.json({ error: 'unauthenticated' }, { status: 401 }) };
  if (!canAccess(session, 'jrl')) return { session, response: Response.json({ error: 'forbidden' }, { status: 403 }) };
  return { session, response: null };
}

export function jrlGet(req) {
  const session = readSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const result = jrlView(session);
  return Response.json(result.body, { status: result.status, headers: { 'cache-control': 'private, no-store' } });
}

export async function jrlWrite(req) {
  const checked = gate(req);
  if (checked.response) return checked.response;
  const gap = jrlAuthGap();
  return Response.json({
    ok: false,
    error: 'supabase_user_required',
    saved: false,
    serviceRoleUsed: false,
    ...gap,
  }, { status: 409, headers: { 'cache-control': 'private, no-store' } });
}
