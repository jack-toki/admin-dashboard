import { canAccess, readSession } from '../../../../../lib/auth.js';
import { loginGate, noteLoginFailure } from '../../../../../lib/auth/throttle.js';
import { clearJrlSessionCookie, jrlSessionCookie, sealJrlSession, signInJrlPassword } from '../../../../../lib/jrl/session.js';
import { openAppStore, supabaseGuard } from '../../../../../lib/store/index.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function subjectFor(req) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  return `jrl-auth:${(forwarded.split(',')[0] || 'local').trim() || 'local'}`;
}

function cockpit(req) {
  const session = readSession(req);
  if (!session) return { response: Response.json({ ok: false, error: 'unauthenticated' }, { status: 401, headers: { 'cache-control': 'private, no-store' } }) };
  if (!canAccess(session, 'jrl')) return { response: Response.json({ ok: false, error: 'forbidden' }, { status: 403, headers: { 'cache-control': 'private, no-store' } }) };
  return { session, response: null };
}

export async function POST(req) {
  const checked = cockpit(req);
  if (checked.response) return checked.response;
  const opened = openAppStore();
  const store = opened.ok && (opened.status.backend === 'file' || supabaseGuard().ok) ? opened.store : null;
  const subject = subjectFor(req);
  const gate = await loginGate({ subject, store, now: Date.now() });
  if (gate.locked) return Response.json({ ok: false, error: 'too_many_attempts' }, { status: 429, headers: { 'cache-control': 'private, no-store' } });
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const signed = await signInJrlPassword({ email: body.email, password: body.password });
  if (!signed.ok) {
    if (signed.error === 'invalid') await noteLoginFailure({ subject, store, now: Date.now() });
    return Response.json({ ok: false, error: signed.error, missing: signed.missing || [] }, { status: signed.status, headers: { 'cache-control': 'private, no-store' } });
  }
  const sealed = sealJrlSession(signed.session);
  return new Response(JSON.stringify({ ok: true, signedIn: true, expiresAt: signed.session.expiresAt }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
      'set-cookie': jrlSessionCookie(sealed),
    },
  });
}

export function DELETE() {
  return new Response(JSON.stringify({ ok: true, signedIn: false }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
      'set-cookie': clearJrlSessionCookie(),
    },
  });
}
