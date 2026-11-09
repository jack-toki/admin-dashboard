// Ordinary Supabase email code for the already confirmed owner.
// create_user is always false. This does not generate an admin link, reset a password,
// or create an account. The caller must already know the confirmed address.
// No message is sent unless requestJrlEmailCode is called.

import { describeJrlProject } from './session.js';
import { establishOwnerLink, expectedOwnerSub, ownerLinkEnabled } from './ownerLink.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ownerEmail(env = process.env) {
  const value = String(env.JRL_OWNER_EMAIL || '').trim().toLowerCase();
  if (!EMAIL.test(value)) return null;
  return value;
}

function anonHeaders(project) {
  return {
    apikey: project.anonKey,
    Authorization: `Bearer ${project.anonKey}`,
    'content-type': 'application/json',
  };
}

function ready(env) {
  if (!ownerLinkEnabled(env)) return { ok: false, status: 409, error: 'owner_link_off' };
  if (!ownerEmail(env)) return { ok: false, status: 409, error: 'owner_email_not_configured' };
  if (!expectedOwnerSub(env)) return { ok: false, status: 409, error: 'owner_sub_not_configured' };
  const project = describeJrlProject(env);
  if (!project.configured) return { ok: false, status: 503, error: 'not_configured' };
  return { ok: true, project, email: ownerEmail(env) };
}

export async function requestJrlEmailCode({ email, env = process.env, fetchImpl = fetch } = {}) {
  const gate = ready(env);
  if (!gate.ok) return gate;
  if (String(email || '').trim().toLowerCase() !== gate.email) {
    return { ok: false, status: 403, error: 'owner_email_rejected' };
  }
  const response = await fetchImpl(`${gate.project.origin}/auth/v1/otp`, {
    method: 'POST',
    headers: anonHeaders(gate.project),
    body: JSON.stringify({ email: gate.email, create_user: false }),
  });
  if (!response.ok) return { ok: false, status: 502, error: 'code_not_sent' };
  return { ok: true, status: 202, sent: true };
}

function sessionFromVerify(body) {
  if (!body?.access_token || !body?.refresh_token) return null;
  const expiresAt = body.expires_at
    ? Number(body.expires_at) * (Number(body.expires_at) < 10_000_000_000 ? 1000 : 1)
    : Date.now() + Number(body.expires_in || 3600) * 1000;
  return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt };
}

export async function verifyJrlEmailCode({ email, token, tokenHash, env = process.env, fetchImpl = fetch, store } = {}) {
  const gate = ready(env);
  if (!gate.ok) return gate;
  if (String(email || '').trim().toLowerCase() !== gate.email) {
    return { ok: false, status: 403, error: 'owner_email_rejected' };
  }
  const code = String(token || '').trim();
  const hash = String(tokenHash || '').trim();
  const payload = hash
    ? { type: 'magiclink', token_hash: hash }
    : { type: 'email', email: gate.email, token: code };
  if (!hash && !/^[0-9]{6,10}$/.test(code)) return { ok: false, status: 400, error: 'invalid' };
  const response = await fetchImpl(`${gate.project.origin}/auth/v1/verify`, {
    method: 'POST',
    headers: anonHeaders(gate.project),
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: 401, error: 'invalid' };
  const session = sessionFromVerify(body);
  if (!session) return { ok: false, status: 502, error: 'auth_rejected' };
  const linked = await establishOwnerLink({ store, session, env });
  if (!linked.ok) return { ok: false, status: linked.error === 'cross_owner' ? 403 : 409, error: linked.error || 'not_linked', linked: false };
  return { ok: true, status: 200, linked: true, subject: expectedOwnerSub(env) };
}
