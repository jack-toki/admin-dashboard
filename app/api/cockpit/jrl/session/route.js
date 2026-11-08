import { canAccess, readSession } from '../../../../../lib/auth.js';
import { loginGate, noteLoginFailure } from '../../../../../lib/auth/throttle.js';
import { clearJrlSessionCookie, jrlSessionCookie, sealJrlSession, signInJrlPassword } from '../../../../../lib/jrl/session.js';
import { establishOwnerLink, ownerLinkEnabled, ownerLinkStore, rejectCrossSiteMutation, revokeOwnerLink } from '../../../../../lib/jrl/ownerLink.js';
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

function noStore(body, status) {
  return Response.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}

export async function POST(req) {
  const checked = cockpit(req);
  if (checked.response) return checked.response;
  const guard = rejectCrossSiteMutation(req);
  if (!guard.ok) return noStore({ ok: false, error: 'cross_site', linked: false }, 403);
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
  let linked = { ok: false, skipped: true };
  if (ownerLinkEnabled()) {
    linked = await establishOwnerLink({ store: ownerLinkStore(store), session: signed.session });
    if (!linked.ok && (linked.error === 'cross_owner' || linked.error === 'owner_sub_not_configured')) {
      return noStore({ ok: false, error: linked.error, linked: false }, 403);
    }
  }
  const sealed = sealJrlSession(signed.session);
  return new Response(JSON.stringify({ ok: true, signedIn: true, expiresAt: signed.session.expiresAt, linked: Boolean(linked.ok) }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
      'set-cookie': jrlSessionCookie(sealed),
    },
  });
}

export async function DELETE(req) {
  const guard = rejectCrossSiteMutation(req);
  if (!guard.ok) return noStore({ ok: false, error: 'cross_site', linked: false }, 403);
  const checked = cockpit(req);
  if (checked.response) return checked.response;
  if (ownerLinkEnabled()) {
    const opened = openAppStore();
    const linkStore = ownerLinkStore(opened.ok ? opened.store : null);
    if (linkStore.ready) await revokeOwnerLink(linkStore);
  }
  return new Response(JSON.stringify({ ok: true, signedIn: false }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
      'set-cookie': clearJrlSessionCookie(),
    },
  });
}
