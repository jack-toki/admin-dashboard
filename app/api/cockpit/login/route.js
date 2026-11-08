import { authConfigStatus, authenticatePassword, clearCookie, readSession, sessionCookie, signSession } from '../../../../lib/auth.js';
import { loginGate, noteLoginFailure, resetProcessThrottle } from '../../../../lib/auth/throttle.js';
import { openAppStore, supabaseGuard } from '../../../../lib/store/index.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function subjectFor(req) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  return (forwarded.split(',')[0] || 'local').trim() || 'local';
}

export async function POST(req) {
  const status = authConfigStatus();
  if (status.state !== 'configured') {
    return Response.json({ ok: false, error: status.error || 'auth_not_configured', missing: status.missing }, { status: 503 });
  }
  const opened = openAppStore();
  const store = opened.ok && (opened.status.backend === 'file' || supabaseGuard().ok) ? opened.store : null;
  const subject = subjectFor(req);
  const gate = await loginGate({ subject, store, now: Date.now() });
  if (gate.locked) {
    return Response.json({ ok: false, error: 'too_many_attempts', durable: gate.durable }, { status: 429 });
  }
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const auth = authenticatePassword(body.password || '');
  if (!auth.ok) {
    if (auth.error === 'password_verifier_malformed' || auth.error === 'auth_not_configured') {
      return Response.json({ ok: false, error: auth.error, missing: auth.missing }, { status: 503 });
    }
    await noteLoginFailure({ subject, store, now: Date.now() });
    return Response.json({ ok: false, error: 'invalid' }, { status: 401 });
  }
  const token = signSession(auth.session);
  return new Response(JSON.stringify({ ok: true, role: auth.session.role, areas: auth.session.areas }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store', 'set-cookie': sessionCookie(token) },
  });
}

export async function DELETE() {
  readSession;
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'set-cookie': clearCookie() },
  });
}

export { resetProcessThrottle };
