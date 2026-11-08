import crypto from 'crypto';

// Standard Xero OAuth client (authorization code). Not a paid custom connection.
// accounting.transactions.read is the smallest scope that can read invoices.
// The write scope accounting.transactions is not requested. Bank transaction endpoints are not called.

export const XERO_SCOPES = [
  'offline_access',
  'accounting.reports.read',
  'accounting.settings.read',
  'accounting.transactions.read',
];

export const XERO_ALLOWED_GET = [
  '/Reports/ProfitAndLoss',
  '/Invoices',
  '/Accounts',
  '/Organisation',
  '/Connections',
];

export function xeroStatus(env = process.env) {
  const names = ['XERO_CLIENT_ID', 'XERO_CLIENT_SECRET', 'XERO_REDIRECT_URI', 'XERO_TOKEN_ENCRYPTION_KEY'];
  const missing = names.filter((name) => !env[name]);
  const present = names.filter((name) => Boolean(env[name]));
  return {
    state: missing.length ? 'not_connected' : 'configured',
    missing,
    present,
    grant: 'authorization_code',
    customConnection: false,
    paidCustomConnectionAssumed: false,
    scopes: XERO_SCOPES,
    writes: false,
    note: 'Create a Xero web-app OAuth client. Do not use a custom connection. Share nothing publicly. The agent sign-in is not this app credential.',
  };
}

export function assertReadOnlyXeroPath(method, path) {
  if (String(method || 'GET').toUpperCase() !== 'GET') {
    throw new Error('xero_write_blocked');
  }
  const allowed = XERO_ALLOWED_GET.some((prefix) => path === prefix || path.startsWith(`${prefix}?`));
  if (!allowed || /banktransactions|payments|manualjournals/i.test(path)) {
    throw new Error('xero_path_blocked');
  }
}

export function buildAuthorizeUrl({ clientId, redirectUri, state }) {
  const url = new URL('https://login.xero.com/identity/connect/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', XERO_SCOPES.join(' '));
  url.searchParams.set('state', state);
  return url.toString();
}

export function signOAuthState(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyOAuthState(token, secret, now = Date.now()) {
  if (!token || !secret) return null;
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < now || !payload.nonce) return null;
    return payload;
  } catch {
    return null;
  }
}

function keyBytes(env) {
  const raw = Buffer.from(String(env.XERO_TOKEN_ENCRYPTION_KEY || ''), 'base64');
  if (raw.length !== 32) return null;
  return raw;
}

export function encryptToken(payload, env = process.env) {
  const key = keyBytes(env);
  if (!key) return { ok: false, error: 'encryption_key_missing' };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ok: true, ciphertext: Buffer.concat([iv, tag, enc]).toString('base64url') };
}

export function decryptToken(ciphertext, env = process.env) {
  const key = keyBytes(env);
  if (!key) return { ok: false, error: 'encryption_key_missing' };
  const buf = Buffer.from(String(ciphertext || ''), 'base64url');
  if (buf.length < 29) return { ok: false, error: 'ciphertext_short' };
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const json = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  return { ok: true, payload: JSON.parse(json) };
}
