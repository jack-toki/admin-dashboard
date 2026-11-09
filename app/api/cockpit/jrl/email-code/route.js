import { canAccess, readSession } from '../../../../../lib/auth.js';
import { loginGate, noteLoginFailure } from '../../../../../lib/auth/throttle.js';
import { requestJrlEmailCode, verifyJrlEmailCode } from '../../../../../lib/jrl/emailOtp.js';
import { ownerLinkStore, rejectCrossSiteMutation } from '../../../../../lib/jrl/ownerLink.js';
import { openAppStore, supabaseGuard } from '../../../../../lib/store/index.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function noStore(body, status) {
  return Response.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}

function cockpit(req) {
  const session = readSession(req);
  if (!session) return { response: noStore({ ok: false, error: 'unauthenticated' }, 401) };
  if (!canAccess(session, 'jrl')) return { response: noStore({ ok: false, error: 'forbidden' }, 403) };
  return { session, response: null };
}

export async function POST(req) {
  const checked = cockpit(req);
  if (checked.response) return checked.response;
  const guard = rejectCrossSiteMutation(req);
  if (!guard.ok) return noStore({ ok: false, error: 'cross_site' }, 403);
  const opened = openAppStore();
  const store = opened.ok && (opened.status.backend === 'file' || supabaseGuard().ok) ? opened.store : null;
  const throttle = `jrl-email:${(req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim() || 'local'}`;
  const gate = await loginGate({ subject: throttle, store, now: Date.now() });
  if (gate.locked) return noStore({ ok: false, error: 'too_many_attempts' }, 429);
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const result = body.token || body.tokenHash
    ? await verifyJrlEmailCode({ email: body.email, token: body.token, tokenHash: body.tokenHash, store: ownerLinkStore(store) })
    : await requestJrlEmailCode({ email: body.email });
  if (!result.ok && result.error === 'invalid') await noteLoginFailure({ subject: throttle, store, now: Date.now() });
  const payload = { ok: result.ok, error: result.error, sent: result.sent || false, linked: result.linked || false };
  if (result.subject) payload.subject = result.subject;
  return noStore(payload, result.status || (result.ok ? 200 : 400));
}
