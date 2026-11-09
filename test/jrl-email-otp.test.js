const test = require('node:test');
const assert = require('node:assert/strict');
const { requestJrlEmailCode, verifyJrlEmailCode, ownerEmail } = require('../lib/jrl/emailOtp');
const { memoryOwnerStore } = require('../lib/jrl/ownerLink');
const { jrlGet } = require('../lib/jrl/http');
const { signSession, cookieName } = require('../lib/auth');

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ADDRESS = 'owner@example.com';

function anonKey() {
  const body = Buffer.from(JSON.stringify({ role: 'anon', ref: 'uxkpqmyzxtjmmixlycio' })).toString('base64url');
  return `eyJhbGciOiJub25lIn0.${body}.sig`;
}

function userJwt(sub) {
  const body = Buffer.from(JSON.stringify({ sub, role: 'authenticated' })).toString('base64url');
  return `eyJhbGciOiJub25lIn0.${body}.sig`;
}

function env(extra = {}) {
  return {
    JRL_OWNER_LINK: 'on',
    JRL_OWNER_SUB: OWNER,
    JRL_OWNER_EMAIL: ADDRESS,
    JRL_SUPABASE_URL: 'https://uxkpqmyzxtjmmixlycio.supabase.co',
    JRL_SUPABASE_ANON_KEY: anonKey(),
    DASHBOARD_SESSION_SECRET: 'session-secret-for-email-code',
    ...extra,
  };
}

test('an email code is refused until the confirmed owner address is configured', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: true, json: async () => ({}) }; };
  const off = await requestJrlEmailCode({ email: ADDRESS, env: env({ JRL_OWNER_LINK: 'off' }), fetchImpl });
  assert.equal(off.error, 'owner_link_off');
  const missing = await requestJrlEmailCode({ email: ADDRESS, env: env({ JRL_OWNER_EMAIL: '' }), fetchImpl });
  assert.equal(missing.error, 'owner_email_not_configured');
  assert.equal(ownerEmail(env({ JRL_OWNER_EMAIL: '' })), null);
  const other = await requestJrlEmailCode({ email: 'someoneelse@example.com', env: env(), fetchImpl });
  assert.equal(other.error, 'owner_email_rejected');
  assert.equal(calls, 0);
});

test('the code request uses the public anon key and cannot create a user', async () => {
  let seen = null;
  const sent = await requestJrlEmailCode({
    email: ADDRESS,
    env: env(),
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return { ok: true, json: async () => ({}) };
    },
  });
  assert.equal(sent.ok, true);
  assert.equal(sent.status, 202);
  assert.equal(seen.url, 'https://uxkpqmyzxtjmmixlycio.supabase.co/auth/v1/otp');
  const body = JSON.parse(seen.init.body);
  assert.equal(body.email, ADDRESS);
  assert.equal(body.create_user, false);
  assert.equal(seen.init.headers.apikey, anonKey());
  assert.equal(seen.init.headers.Authorization, `Bearer ${anonKey()}`);
  assert.equal(JSON.stringify(seen).includes('service_role'), false);
});

test('verification stores only the confirmed owner and does not return the token', async () => {
  const store = memoryOwnerStore();
  const rejected = await verifyJrlEmailCode({
    email: ADDRESS,
    token: '123456',
    env: env(),
    store,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ access_token: userJwt(OTHER), refresh_token: 'foreign-refresh', expires_in: 3600 }),
    }),
  });
  assert.equal(rejected.error, 'cross_owner');
  assert.equal(await store.read(), null);
  let verifyBody = null;
  const linked = await verifyJrlEmailCode({
    email: ADDRESS,
    token: '654321',
    env: env(),
    store,
    fetchImpl: async (url, init) => {
      verifyBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({ access_token: userJwt(OWNER), refresh_token: 'owner-refresh', expires_in: 3600 }),
      };
    },
  });
  assert.equal(verifyBody.type, 'email');
  assert.equal(verifyBody.create_user, undefined);
  assert.equal(linked.ok, true);
  assert.equal(linked.subject, OWNER);
  assert.equal(JSON.stringify(linked).includes('owner-refresh'), false);
  assert.equal(JSON.stringify(linked).includes(userJwt(OWNER)), false);
  const saved = await store.read();
  assert.equal(saved.sub, OWNER);
  assert.equal(saved.refreshToken, 'owner-refresh');

  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = env().DASHBOARD_SESSION_SECRET;
  try {
    const cockpit = signSession({ role: 'admin', areas: ['jrl'] }, env());
    const res = await jrlGet(new Request('http://localhost/api/cockpit/jrl', {
      headers: { cookie: `${cookieName()}=${cockpit}` },
    }), {
      env: env(),
      ownerStore: store,
      now: Date.now(),
      fetchImpl: async () => ({ ok: true, json: async () => [] }),
    });
    const body = await res.json();
    assert.equal(body.auth.supabaseUser, true);
    assert.equal(body.auth.subject, OWNER);
    assert.equal(JSON.stringify(body).includes('owner-refresh'), false);
    assert.equal(JSON.stringify(body).includes(userJwt(OWNER)), false);
  } finally {
    if (previous == null) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous;
  }
});
