const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { authConfigStatus, authenticatePassword, clearCookie, createPasswordVerifier, signSession } = require('../lib/auth');
const { POST, DELETE } = require('../app/api/cockpit/login/route');
const { resetProcessThrottle } = require('../lib/auth/throttle');

const SECRET = 'session-secret-for-verifier-test';

function env(extra) {
  return { DASHBOARD_SESSION_SECRET: SECRET, ...extra };
}

test('a verifier accepts the right password and rejects the wrong one without using the legacy password', () => {
  const password = `pw-${Math.random().toString(36).slice(2)}`;
  const hash = createPasswordVerifier(password);
  const configured = env({ DASHBOARD_PASSWORD_HASH: hash, DASHBOARD_PASSWORD: 'legacy-value' });
  assert.equal(authConfigStatus(configured).verifier, true);
  assert.equal(authenticatePassword(password, configured).ok, true);
  assert.equal(authenticatePassword('legacy-value', configured).ok, false);
  assert.equal(authenticatePassword('[REDACTED]', configured).error, 'invalid');
});

test('a malformed verifier fails closed and does not accept the legacy or marker password', () => {
  const configured = env({ DASHBOARD_PASSWORD_HASH: '[REDACTED]', DASHBOARD_PASSWORD: '[REDACTED]' });
  const status = authConfigStatus(configured);
  assert.equal(status.state, 'not_configured');
  assert.equal(status.error, 'password_verifier_malformed');
  const attempt = authenticatePassword('[REDACTED]', configured);
  assert.equal(attempt.ok, false);
  assert.equal(attempt.error, 'password_verifier_malformed');
});

test('with no verifier and no password, sign-in is not configured', () => {
  const status = authConfigStatus({ DASHBOARD_SESSION_SECRET: SECRET });
  assert.equal(status.state, 'not_configured');
  assert.ok(status.missing.includes('DASHBOARD_PASSWORD'));
  assert.equal(authenticatePassword('anything', { DASHBOARD_SESSION_SECRET: SECRET }).error, 'auth_not_configured');
});

test('login and logout keep the session guard and the cookie contract', async () => {
  resetProcessThrottle();
  const previous = {
    DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD,
    DASHBOARD_PASSWORD_HASH: process.env.DASHBOARD_PASSWORD_HASH,
    DASHBOARD_SESSION_SECRET: process.env.DASHBOARD_SESSION_SECRET,
  };
  const password = `pw-${Math.random().toString(36).slice(2)}`;
  process.env.DASHBOARD_SESSION_SECRET = SECRET;
  process.env.DASHBOARD_PASSWORD_HASH = createPasswordVerifier(password);
  delete process.env.DASHBOARD_PASSWORD;
  try {
    const wrong = await POST(new Request('http://localhost/api/cockpit/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'not-the-password' }),
    }));
    assert.equal(wrong.status, 401);
    const right = await POST(new Request('http://localhost/api/cockpit/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    }));
    assert.equal(right.status, 200);
    const cookie = right.headers.get('set-cookie') || '';
    assert.match(cookie, /^toki_cockpit_session=\S+/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    const signed = signSession({ role: 'admin', areas: ['toki'] }, { DASHBOARD_SESSION_SECRET: SECRET });
    assert.equal(typeof signed, 'string');
    const gone = await DELETE();
    assert.equal(gone.status, 200);
    assert.match(gone.headers.get('set-cookie') || '', /toki_cockpit_session=;/);
    assert.match(clearCookie({ NODE_ENV: 'production' }), /Max-Age=0/);
    assert.match(clearCookie({ NODE_ENV: 'production' }), /Secure/);
  } finally {
    resetProcessThrottle();
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('the generator writes a mode 0600 verifier and does not print it', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'toki-verifier-'));
  const out = path.join(directory, 'verifier');
  const password = `pw-${Math.random().toString(36).slice(2)}`;
  const run = spawnSync(process.execPath, ['scripts/dashboard-password-hash.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DASHBOARD_PASSWORD: password, DASHBOARD_PASSWORD_HASH_OUT: out },
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.includes(password), false);
  const written = fs.readFileSync(out, 'utf8').trim();
  assert.equal(run.stdout.includes(written), false);
  assert.equal(run.stderr.includes(written), false);
  assert.equal(fs.statSync(out).mode & 0o777, 0o600);
  assert.equal(authenticatePassword(password, env({ DASHBOARD_PASSWORD_HASH: written })).ok, true);
  fs.rmSync(directory, { recursive: true, force: true });
});
