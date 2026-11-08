import crypto from 'crypto';

const COOKIE = 'toki_cockpit_session';

function sessionSecret() {
  return process.env.DASHBOARD_SESSION_SECRET || '';
}

export function authConfigStatus(env = process.env) {
  const missing = [];
  if (!env.DASHBOARD_PASSWORD) missing.push('DASHBOARD_PASSWORD');
  if (!env.DASHBOARD_SESSION_SECRET) missing.push('DASHBOARD_SESSION_SECRET');
  return {
    state: missing.length ? 'not_configured' : 'configured',
    missing,
  };
}

function safeEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const right = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(left, right);
}

export function authenticatePassword(password, env = process.env) {
  const status = authConfigStatus(env);
  if (status.state !== 'configured') return { ok: false, error: 'auth_not_configured', missing: status.missing };
  const attempt = String(password ?? '');
  if (!attempt) return { ok: false, error: 'invalid' };
  if (env.DASHBOARD_PASSWORD && safeEqual(attempt, env.DASHBOARD_PASSWORD)) {
    return { ok: true, session: { role: 'admin', areas: ['toki', 'automations', 'jrl'] } };
  }
  if (env.JRL_PASSWORD && safeEqual(attempt, env.JRL_PASSWORD)) {
    return { ok: true, session: { role: 'jrl', areas: ['jrl'] } };
  }
  let clients = {};
  try { clients = JSON.parse(env.CLIENT_ACCESS_KEYS || '{}'); } catch { clients = {}; }
  for (const [key, client] of Object.entries(clients)) {
    if (key && safeEqual(attempt, key)) {
      return { ok: true, session: { role: 'client', areas: ['automations'], client: String(client) } };
    }
  }
  return { ok: false, error: 'invalid' };
}

export function signSession(session, env = process.env, now = Date.now()) {
  if (!env.DASHBOARD_SESSION_SECRET) throw new Error('session_secret_missing');
  const payload = {
    v: 1,
    role: session.role,
    areas: session.areas,
    client: session.client || null,
    exp: now + 12 * 60 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', env.DASHBOARD_SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(token, env = process.env, now = Date.now()) {
  if (!token || !env.DASHBOARD_SESSION_SECRET) return null;
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', env.DASHBOARD_SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function cookieName() {
  return COOKIE;
}

export function sessionCookie(token, env = process.env) {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${12 * 60 * 60}${secure}`;
}

export function clearCookie(env = process.env) {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

export function tokenFromRequest(req) {
  const header = req.headers.get('cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}

export function readSession(req, env = process.env) {
  return verifySession(tokenFromRequest(req), env);
}

export function canAccess(session, area) {
  return Boolean(session && Array.isArray(session.areas) && session.areas.includes(area));
}
