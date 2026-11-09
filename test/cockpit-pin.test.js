const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { signInRequired, createPasswordVerifier, signSession, cookieName } = require('../lib/auth');
const { decidePinThrottle, resetProcessThrottle } = require('../lib/auth/throttle');
const { isFourDigitCode, pinMatches } = require('../lib/auth/pin');
const { GET, POST } = require('../app/api/cockpit/login/route');
const { POST: savePin } = require('../app/api/cockpit/pin/route');

const SECRET = 'session-secret-for-pin-test';

test('preview opens without sign-in and production stays locked', () => {
  assert.equal(signInRequired({ VERCEL_ENV: 'production' }), true);
  assert.equal(signInRequired({ VERCEL_ENV: 'preview' }), false);
  assert.equal(signInRequired({ VERCEL_ENV: 'preview', COCKPIT_PREVIEW_AUTH: 'on' }), true);
  assert.equal(signInRequired({}), true);
  const page = fs.readFileSync(path.join(__dirname, '../app/cockpit/page.js'), 'utf8');
  assert.match(page, /signInRequired/);
  assert.match(page, /previewAdminSession/);
});

test('a 4-digit code replaces the password until it is unset', async () => {
  resetProcessThrottle();
  const code = String(1000 + Math.floor(Math.random() * 9000));
  const hash = createPasswordVerifier(code);
  assert.equal(isFourDigitCode(code), true);
  assert.equal(isFourDigitCode('12'), false);
  assert.equal(pinMatches(code, hash), true);
  assert.equal(pinMatches('0000', hash), false);
  const previous = {
    DASHBOARD_SESSION_SECRET: process.env.DASHBOARD_SESSION_SECRET,
    DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD,
    DASHBOARD_PASSWORD_HASH: process.env.DASHBOARD_PASSWORD_HASH,
    DASHBOARD_PIN_HASH: process.env.DASHBOARD_PIN_HASH,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
  process.env.DASHBOARD_SESSION_SECRET = SECRET;
  process.env.DASHBOARD_PASSWORD = 'legacy-password';
  delete process.env.DASHBOARD_PASSWORD_HASH;
  process.env.DASHBOARD_PIN_HASH = hash;
  delete process.env.VERCEL_ENV;
  try {
    const status = await GET();
    const mode = await status.json();
    assert.equal(mode.mode, 'pin');
    assert.equal(mode.signInRequired, true);
    const wrong = await POST(new Request('http://localhost/api/cockpit/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
      body: JSON.stringify({ pin: '0000', password: 'legacy-password' }),
    }));
    assert.equal(wrong.status, 401);
    const right = await POST(new Request('http://localhost/api/cockpit/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
      body: JSON.stringify({ pin: code }),
    }));
    assert.equal(right.status, 200);
    assert.match(right.headers.get('set-cookie') || '', /toki_cockpit_session=/);
  } finally {
    resetProcessThrottle();
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('five wrong codes from one address lock, and a global burst locks everyone', () => {
  const now = Date.now();
  const five = [1, 2, 3, 4, 5].map((item) => now - item * 1000);
  const locked = decidePinThrottle({ ip: five, global: [], now });
  assert.equal(locked.locked, true);
  assert.ok(locked.retryAfterMs >= 15 * 60 * 1000);
  const open = decidePinThrottle({ ip: five.slice(0, 4), global: [], now });
  assert.equal(open.locked, false);
  const global = decidePinThrottle({ ip: [], global: Array.from({ length: 20 }, (_, index) => now - index * 1000), now });
  assert.equal(global.locked, true);
});

test('changing the code needs the current secret and stores only a hash', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-pin-'));
  const code = '2468';
  const env = {
    APP_STORE: 'file',
    APP_STORE_PATH: path.join(directory, 'store.enc'),
    APP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    DASHBOARD_SESSION_SECRET: SECRET,
    DASHBOARD_PASSWORD: 'legacy-password',
    NODE_ENV: 'test',
  };
  const previous = {};
  for (const key of Object.keys(env)) previous[key] = process.env[key];
  Object.assign(process.env, env);
  delete process.env.DASHBOARD_PIN_HASH;
  delete process.env.DASHBOARD_PASSWORD_HASH;
  try {
    const token = signSession({ role: 'admin', areas: ['toki'] }, env);
    const cookie = `${cookieName()}=${token}`;
    const mismatch = await savePin(new Request('http://localhost/api/cockpit/pin', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ current: 'legacy-password', next: '1357', confirm: '1358' }),
    }));
    assert.equal(mismatch.status, 400);
    const saved = await savePin(new Request('http://localhost/api/cockpit/pin', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ current: 'legacy-password', next: code, confirm: code }),
    }));
    assert.equal(saved.status, 200);
    const body = await saved.json();
    assert.equal(body.stored, true);
    assert.equal(JSON.stringify(body).includes(code), false);
    const sql = fs.readFileSync(path.join(__dirname, '../supabase/cockpit_sign_in_code.sql'), 'utf8');
    assert.match(sql, /create table cockpit\.cockpit_sign_in_code/);
    assert.match(sql, /grant select, insert, update on table cockpit\.cockpit_sign_in_code to service_role/);
    assert.equal(/delete/i.test(sql.replace(/cannot delete/i, '')), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
