import crypto from 'crypto';
import { safeCockpitReturn } from './return.js';

export { safeCockpitReturn };

// JRL ledger auth uses the public anon key and the person's own Supabase session.
// The cockpit password is a different cookie. The service role is never accepted.

export const EXPECTED_PROJECT_REF = 'uxkpqmyzxtjmmixlycio';
export const JRL_COOKIE = 'jrl_supabase_session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

export function classifyAnonKey(key) {
  const value = String(key || '');
  if (!value) return { accepted: false, format: 'missing', role: null };
  if (value.startsWith('sb_secret_')) return { accepted: false, format: 'secret', role: 'service_role' };
  if (value.startsWith('sb_publishable_')) return { accepted: true, format: 'publishable', role: 'anon' };
  const payload = decodeJwtPayload(value);
  if (payload?.role === 'service_role') return { accepted: false, format: 'legacy_jwt', role: 'service_role' };
  if (payload?.role === 'anon') return { accepted: true, format: 'legacy_jwt', role: 'anon' };
  return { accepted: false, format: 'unrecognized', role: payload?.role || null };
}

export function describeJrlProject(env = process.env) {
  const url = env.JRL_SUPABASE_URL || '';
  const anonKey = env.JRL_SUPABASE_ANON_KEY || '';
  const key = classifyAnonKey(anonKey);
  const missing = [];
  if (!url) missing.push('JRL_SUPABASE_URL');
  if (!anonKey) missing.push('JRL_SUPABASE_ANON_KEY');
  let origin = '';
  let ref = '';
  if (url) {
    try {
      const parsed = new URL(url);
      origin = parsed.origin;
      ref = parsed.hostname.split('.')[0];
    } catch {
      origin = '';
    }
  }
  const refMatches = Boolean(origin) && ref === EXPECTED_PROJECT_REF;
  if (url && !refMatches) missing.push('JRL_SUPABASE_URL');
  if (anonKey && !key.accepted) missing.push('JRL_SUPABASE_ANON_KEY');
  const configured = Boolean(origin && anonKey && refMatches && key.accepted);
  return {
    configured,
    missing: [...new Set(missing)],
    keyFormat: key.format,
    keyAccepted: key.accepted,
    publishableKeyRequired: false,
    projectRefMatches: refMatches,
    expectedRef: EXPECTED_PROJECT_REF,
    origin: configured ? origin : '',
    anonKey: configured ? anonKey : '',
  };
}

export function jrlPublicConfig(env = process.env) {
  const project = describeJrlProject(env);
  return {
    configured: project.configured,
    missing: project.missing,
    keyFormat: project.keyFormat,
    keyAccepted: project.keyAccepted,
    publishableKeyRequired: false,
    projectRefMatches: project.projectRefMatches,
    expectedRef: project.expectedRef,
    serviceRoleUsed: false,
  };
}

export function sealJrlSession(session, env = process.env) {
  if (!env.DASHBOARD_SESSION_SECRET) throw new Error('session_secret_missing');
  const key = crypto.createHash('sha256').update(`jrl:${env.DASHBOARD_SESSION_SECRET}`).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(session), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, body]).toString('base64url');
}

export function openJrlSession(token, env = process.env) {
  if (!token || !env.DASHBOARD_SESSION_SECRET) return null;
  try {
    const raw = Buffer.from(String(token), 'base64url');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const body = raw.subarray(28);
    const key = crypto.createHash('sha256').update(`jrl:${env.DASHBOARD_SESSION_SECRET}`).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    const session = JSON.parse(json);
    if (!session?.accessToken || !session?.refreshToken || !session?.expiresAt) return null;
    return session;
  } catch {
    return null;
  }
}

export function jrlSessionFromRequest(req, env = process.env) {
  const header = req.headers.get('cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${JRL_COOKIE}=([^;]+)`));
  return openJrlSession(match ? decodeURIComponent(match[1]) : '', env);
}

export function jrlSessionCookie(token, env = process.env) {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${JRL_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`;
}

export function clearJrlSessionCookie(env = process.env) {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${JRL_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

function decodeJwtPayload(token) {
  const part = String(token).split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function sessionFromToken(body) {
  if (!body?.access_token || !body?.refresh_token) return null;
  const expiresAt = body.expires_at
    ? Number(body.expires_at) * (Number(body.expires_at) < 10_000_000_000 ? 1000 : 1)
    : Date.now() + Number(body.expires_in || 3600) * 1000;
  return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt };
}

async function tokenGrant(project, grant, payload, fetchImpl) {
  const response = await fetchImpl(`${project.origin}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: {
      apikey: project.anonKey,
      Authorization: `Bearer ${project.anonKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: response.status === 400 ? 'invalid' : 'auth_rejected' };
  const session = sessionFromToken(body);
  if (!session) return { ok: false, error: 'auth_rejected' };
  return { ok: true, session };
}

export async function signInJrlPassword({ email, password, env = process.env, fetchImpl = fetch }) {
  const project = describeJrlProject(env);
  if (!project.configured) return { ok: false, status: 503, error: 'not_configured', ...jrlPublicConfig(env) };
  const address = String(email || '').trim();
  if (!address || !password) return { ok: false, status: 400, error: 'invalid' };
  const granted = await tokenGrant(project, 'password', { email: address, password }, fetchImpl);
  if (!granted.ok) return { ok: false, status: granted.error === 'invalid' ? 401 : 502, error: granted.error };
  return { ok: true, status: 200, session: granted.session };
}

export async function refreshJrlSession(session, env = process.env, fetchImpl = fetch) {
  const project = describeJrlProject(env);
  if (!project.configured || !session?.refreshToken) return { ok: false, error: 'not_configured' };
  return tokenGrant(project, 'refresh_token', { refresh_token: session.refreshToken }, fetchImpl);
}

export async function currentJrlAccess(req, env = process.env, fetchImpl = fetch, now = Date.now()) {
  const session = jrlSessionFromRequest(req, env);
  if (!session) return { ok: false, signedIn: false };
  if (session.expiresAt - 60_000 > now) return { ok: true, signedIn: true, accessToken: session.accessToken, expiresAt: session.expiresAt, refreshed: false };
  const next = await refreshJrlSession(session, env, fetchImpl);
  if (!next.ok) return { ok: false, signedIn: false, expired: true };
  return { ok: true, signedIn: true, accessToken: next.session.accessToken, expiresAt: next.session.expiresAt, refreshed: true, sealed: sealJrlSession(next.session, env) };
}
