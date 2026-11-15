import crypto from 'crypto';

const COOKIE = 'toki_cockpit_session';

// scrypt$N$r$p$<salt-standard-base64>$<32-byte-hash-standard-base64>
// N=16384, r=8, p=1, salt=16 bytes, key=32 bytes, maxmem=33554432.
// Node: crypto.scryptSync(password, salt, 32, { N, r, p, maxmem }).
export const PASSWORD_HASH_PARAMS = { N: 16384, r: 8, p: 1, keylen: 32, saltBytes: 16, maxmem: 32 * 1024 * 1024 };

function scryptOptions() {
  return { N: PASSWORD_HASH_PARAMS.N, r: PASSWORD_HASH_PARAMS.r, p: PASSWORD_HASH_PARAMS.p, maxmem: PASSWORD_HASH_PARAMS.maxmem };
}

export function createPasswordVerifier(password) {
  const salt = crypto.randomBytes(PASSWORD_HASH_PARAMS.saltBytes);
  const hash = crypto.scryptSync(String(password), salt, PASSWORD_HASH_PARAMS.keylen, scryptOptions());
  return `scrypt$${PASSWORD_HASH_PARAMS.N}$${PASSWORD_HASH_PARAMS.r}$${PASSWORD_HASH_PARAMS.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function parsePasswordVerifier(value) {
  const parts = String(value || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (N !== PASSWORD_HASH_PARAMS.N || r !== PASSWORD_HASH_PARAMS.r || p !== PASSWORD_HASH_PARAMS.p) return null;
  let salt;
  let hash;
  try {
    salt = Buffer.from(parts[4], 'base64');
    hash = Buffer.from(parts[5], 'base64');
  } catch {
    return null;
  }
  if (salt.length !== PASSWORD_HASH_PARAMS.saltBytes || hash.length !== PASSWORD_HASH_PARAMS.keylen) return null;
  if (salt.toString('base64') !== parts[4] || hash.toString('base64') !== parts[5]) return null;
  return { N, r, p, salt, hash };
}

function verifierMatches(password, parsed) {
  const derived = crypto.scryptSync(String(password), parsed.salt, PASSWORD_HASH_PARAMS.keylen, scryptOptions());
  return crypto.timingSafeEqual(derived, parsed.hash);
}

function sessionSecret() {
  return process.env.DASHBOARD_SESSION_SECRET || '';
}

export function authConfigStatus(env = process.env) {
  const missing = [];
  const hash = env.DASHBOARD_PASSWORD_HASH;
  const hashSet = hash != null && String(hash).length > 0;
  if (!env.DASHBOARD_SESSION_SECRET) missing.push('DASHBOARD_SESSION_SECRET');
  if (hashSet) {
    if (!parsePasswordVerifier(hash)) {
      return {
        state: 'not_configured',
        error: 'password_verifier_malformed',
        missing: ['DASHBOARD_PASSWORD_HASH', ...missing],
        verifier: true,
      };
    }
    return { state: missing.length ? 'not_configured' : 'configured', missing, verifier: true };
  }
  if (!env.DASHBOARD_PASSWORD) missing.push('DASHBOARD_PASSWORD');
  return {
    state: missing.length ? 'not_configured' : 'configured',
    missing,
    verifier: false,
  };
}

function safeEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const right = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(left, right);
}

export function authenticatePassword(password, env = process.env) {
  const status = authConfigStatus(env);
  if (status.state !== 'configured') {
    return { ok: false, error: status.error || 'auth_not_configured', missing: status.missing };
  }
  const attempt = String(password ?? '');
  if (!attempt) return { ok: false, error: 'invalid' };
  const hash = env.DASHBOARD_PASSWORD_HASH;
  if (hash != null && String(hash).length > 0) {
    const parsed = parsePasswordVerifier(hash);
    if (!parsed) return { ok: false, error: 'password_verifier_malformed', missing: ['DASHBOARD_PASSWORD_HASH'] };
    if (verifierMatches(attempt, parsed)) {
      return { ok: true, session: { role: 'admin', areas: ['toki', 'automations', 'jrl'] } };
    }
  } else if (env.DASHBOARD_PASSWORD && safeEqual(attempt, env.DASHBOARD_PASSWORD)) {
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

export function signInRequired(env = process.env) {
  if (String(env.COCKPIT_PREVIEW_AUTH || '').toLowerCase() === 'on') return true;
  if (env.VERCEL_ENV === 'production') return true;
  // Unset means local and tests, which stay locked. Vercel sets preview or development.
  if (!env.VERCEL_ENV) return true;
  return false;
}

export function previewAdminSession() {
  return { v: 1, role: 'admin', areas: ['toki', 'automations', 'jrl'], client: null, preview: true };
}

export function readSession(req, env = process.env) {
  const session = verifySession(tokenFromRequest(req), env);
  if (session) return session;
  if (!signInRequired(env)) return previewAdminSession();
  return null;
}

export function canAccess(session, area) {
  return Boolean(session && Array.isArray(session.areas) && session.areas.includes(area));
}
