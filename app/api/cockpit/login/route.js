import { authConfigStatus, authenticatePassword, clearCookie, sessionCookie, signSession } from '../../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const status = authConfigStatus();
  if (status.state !== 'configured') {
    return Response.json({ ok: false, error: 'auth_not_configured', missing: status.missing }, { status: 503 });
  }
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const auth = authenticatePassword(body.password || '');
  if (!auth.ok) return Response.json({ ok: false, error: 'invalid' }, { status: 401 });
  const token = signSession(auth.session);
  return new Response(JSON.stringify({ ok: true, role: auth.session.role, areas: auth.session.areas }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store', 'set-cookie': sessionCookie(token) },
  });
}

export async function DELETE() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'set-cookie': clearCookie() },
  });
}
