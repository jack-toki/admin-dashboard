import { authConfigStatus, authenticatePassword, clearCookie, readSession, sessionCookie, signInRequired, signSession } from '../../../../lib/auth.js';
import { activePinHash, pinMatches } from '../../../../lib/auth/pin.js';
import { loginGate, noteLoginFailure, notePinFailure, pinGate, resetProcessThrottle } from '../../../../lib/auth/throttle.js';
import { openAppStore, supabaseGuard } from '../../../../lib/store/index.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function subjectFor(req) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  return (forwarded.split(',')[0] || 'local').trim() || 'local';
}

function openStore() {
  const opened = openAppStore();
  return opened.ok && (opened.status.backend === 'file' || supabaseGuard().ok) ? opened.store : null;
}

export async function GET() {
  const store = openStore();
  const pin = await activePinHash(process.env, store);
  return Response.json({
    ok: true,
    mode: pin.hash ? 'pin' : 'password',
    signInRequired: signInRequired(),
  }, { headers: { 'cache-control': 'private, no-store' } });
}

export async function POST(req) {
  if (!process.env.DASHBOARD_SESSION_SECRET) {
    return Response.json({ ok: false, error: 'auth_not_configured', missing: ['DASHBOARD_SESSION_SECRET'] }, { status: 503 });
  }
  const store = openStore();
  const subject = subjectFor(req);
  const pin = await activePinHash(process.env, store);
  if (!pin.hash) {
    const status = authConfigStatus();
    if (status.state !== 'configured') {
      return Response.json({ ok: false, error: status.error || 'auth_not_configured', missing: status.missing }, { status: 503 });
    }
  }
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  if (pin.hash) {
    const gate = await pinGate({ subject, store, now: Date.now() });
    if (gate.locked) {
      return Response.json({ ok: false, error: 'too_many_attempts', retryAfterMs: gate.retryAfterMs }, { status: 429 });
    }
    const code = String(body.pin || '');
    if (!pinMatches(code, pin.hash)) {
      await notePinFailure({ subject, store, now: Date.now() });
      return Response.json({ ok: false, error: 'invalid' }, { status: 401 });
    }
    const token = signSession({ role: 'admin', areas: ['toki', 'automations', 'jrl'] });
    return new Response(JSON.stringify({ ok: true, role: 'admin', areas: ['toki', 'automations', 'jrl'] }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store', 'set-cookie': sessionCookie(token) },
    });
  }
  const gate = await loginGate({ subject, store, now: Date.now() });
  if (gate.locked) {
    return Response.json({ ok: false, error: 'too_many_attempts', durable: gate.durable }, { status: 429 });
  }
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
