const test = require('node:test');
const assert = require('node:assert/strict');
const { encryptToken } = require('../lib/xero/oauth');
const { readOauthToken, compareAndSwapOauthToken } = require('../lib/store/tokenCas');
const { jrlGet, jrlWrite } = require('../lib/jrl/http');
const { signSession, cookieName } = require('../lib/auth');
const { potGet, potPut } = require('../lib/cockpit/http');
const potsRoute = require('../app/api/cockpit/jrl/pots/route');

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function anonKey() {
  const body = Buffer.from(JSON.stringify({ role: 'anon', ref: 'uxkpqmyzxtjmmixlycio' })).toString('base64url');
  return `eyJhbGciOiJub25lIn0.${body}.sig`;
}

function userJwt(sub) {
  const body = Buffer.from(JSON.stringify({ sub, role: 'authenticated' })).toString('base64url');
  return `eyJhbGciOiJub25lIn0.${body}.sig`;
}

function baseEnv(extra = {}) {
  return {
    JRL_OWNER_LINK: 'on',
    JRL_OWNER_SUB: OWNER,
    JRL_SUPABASE_URL: 'https://uxkpqmyzxtjmmixlycio.supabase.co',
    JRL_SUPABASE_ANON_KEY: anonKey(),
    DASHBOARD_SESSION_SECRET: 'session-secret-for-linked-read',
    APP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString('base64'),
    ...extra,
  };
}

function tokenStore(env, payload, generation = 1) {
  const enc = encryptToken({ ...payload, generation }, env);
  assert.equal(enc.ok, true);
  const row = { ciphertext: enc.ciphertext, generation };
  let reads = 0;
  const client = {
    from() {
      const filters = {};
      let patch = null;
      const api = {
        select() { return patch ? finish() : api; },
        update(next) { patch = next; return api; },
        eq(key, value) { filters[key] = value; return api; },
        limit() { return finish(); },
        insert() { return { select: async () => ({ data: [], error: { code: '23505' } }) }; },
      };
      function finish() {
        reads += patch ? 0 : 1;
        if (patch) {
          if (Number(filters.generation) !== Number(row.generation)) return Promise.resolve({ data: [], error: null });
          row.ciphertext = patch.ciphertext;
          row.generation = patch.generation;
          return Promise.resolve({ data: [{ generation: row.generation }], error: null });
        }
        if (filters.provider !== 'jrl' || filters.tenant_key !== 'owner') return Promise.resolve({ data: [], error: null });
        return Promise.resolve({ data: [{ ciphertext: row.ciphertext, generation: row.generation }], error: null });
      }
      return api;
    },
  };
  return {
    reads: () => reads,
    row: () => ({ ...row }),
    backend: 'supabase',
    shared: true,
    async readToken(args) {
      const result = await readOauthToken(client, env, args);
      if (!result.ok) {
        const error = new Error(result.error);
        error.code = result.error;
        throw error;
      }
      return result.record;
    },
    compareAndSwapToken(args) {
      return compareAndSwapOauthToken(client, env, args);
    },
  };
}

test('a cockpit password session reads and writes the ledger from the encrypted owner row', async () => {
  const env = baseEnv();
  const store = tokenStore(env, {
    sub: OWNER,
    refreshToken: 'refresh-kept',
    accessToken: userJwt(OWNER),
    expiresAt: Date.now() + 3_600_000,
    revoked: false,
    phase: 'ready',
  });
  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = env.DASHBOARD_SESSION_SECRET;
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), authorization: init?.headers?.Authorization || '' });
    assert.equal(String(init?.headers?.apikey || '').includes('service_role'), false);
    assert.equal(String(url).includes('service_role'), false);
    return { ok: true, json: async () => [{ period: '2026-11-01', tax_in: 1, savings_in: 0, hl_in: 0, savings_out: 0, hl_value: 4 }] };
  };
  try {
    const cockpit = signSession({ role: 'admin', areas: ['jrl'] }, env);
    const headers = { cookie: `${cookieName()}=${cockpit}` };
    const res = await jrlGet(new Request('http://localhost/api/cockpit/jrl', { headers }), { env, store, fetchImpl, now: Date.now() });
    const body = await res.json();
    assert.equal(body.auth.supabaseUser, true);
    assert.equal(body.auth.subject, OWNER);
    assert.equal(body.auth.ownerLink, true);
    assert.equal(body.source.connected, true);
    assert.equal(body.source.ledger, 'readable');
    assert.equal(body.entries.length, 1);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /monthly_finance/);
    assert.equal(calls[0].authorization, `Bearer ${userJwt(OWNER)}`);
    assert.equal(JSON.stringify(body).includes('refresh-kept'), false);
    assert.equal(store.row().generation, 1);

    calls.length = 0;
    const write = await jrlWrite(new Request('http://localhost/api/cockpit/jrl/month', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ period: '2026-11-01', tax_in: 1, savings_in: 0, hl_in: 0, savings_out: 0, hl_value: 4 }),
    }), { env, store, fetchImpl, now: Date.now() });
    const wrote = await write.json();
    assert.equal(wrote.saved, true);
    assert.equal(wrote.serviceRoleUsed, false);
    assert.equal(calls[0].authorization, `Bearer ${userJwt(OWNER)}`);
  } finally {
    if (previous == null) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous;
  }
});

test('a wrong subject and a disabled link do not open the ledger', async () => {
  const env = baseEnv();
  const store = tokenStore(env, {
    sub: OTHER,
    refreshToken: 'refresh-other',
    accessToken: userJwt(OTHER),
    expiresAt: Date.now() + 3_600_000,
    revoked: false,
    phase: 'ready',
  });
  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = env.DASHBOARD_SESSION_SECRET;
  let ledgerCalls = 0;
  const fetchImpl = async () => { ledgerCalls += 1; return { ok: true, json: async () => [] }; };
  try {
    const cockpit = signSession({ role: 'admin', areas: ['jrl'] }, env);
    const headers = { cookie: `${cookieName()}=${cockpit}` };
    const mismatch = await jrlGet(new Request('http://localhost/api/cockpit/jrl', { headers }), { env, store, fetchImpl, now: Date.now() });
    const mismatched = await mismatch.json();
    assert.equal(mismatched.auth.supabaseUser, false);
    assert.equal(mismatched.auth.linkError, 'cross_owner');
    assert.equal(mismatched.source.connected, false);
    assert.equal(mismatched.entries.length, 0);
    assert.equal(ledgerCalls, 0);
    assert.equal(JSON.stringify(mismatched).includes('refresh-other'), false);

    let reads = 0;
    const idle = {
      backend: 'supabase',
      shared: true,
      async readToken() { reads += 1; return null; },
      async compareAndSwapToken() { throw new Error('should not write'); },
    };
    const off = await jrlGet(new Request('http://localhost/api/cockpit/jrl', { headers }), {
      env: { ...env, JRL_OWNER_LINK: 'off' },
      store: idle,
      fetchImpl,
      now: Date.now(),
    });
    const closed = await off.json();
    assert.equal(closed.auth.ownerLink, false);
    assert.equal(closed.auth.supabaseUser, false);
    assert.equal(closed.auth.linkError, undefined);
    assert.equal(reads, 0);
  } finally {
    if (previous == null) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous;
  }
});

test('pot edits use PUT and an empty store stays at the placeholder', async () => {
  assert.equal(potsRoute.POST, undefined);
  assert.equal(typeof potsRoute.PUT, 'function');
  const env = { DASHBOARD_SESSION_SECRET: 'session-secret-for-pots', NODE_ENV: 'test' };
  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = env.DASHBOARD_SESSION_SECRET;
  let saved = null;
  const openAppStore = () => ({
    ok: true,
    status: { backend: 'supabase', shared: true },
    store: {
      async readPotRecord() { return saved; },
      async savePotRecord(record) { saved = record; return record; },
    },
  });
  try {
    const cockpit = signSession({ role: 'admin', areas: ['jrl'] }, env);
    const headers = { cookie: `${cookieName()}=${cockpit}`, 'content-type': 'application/json' };
    const first = await potGet(new Request('http://localhost/api/cockpit/jrl/pots', { headers }), { env, openAppStore });
    const empty = await first.json();
    assert.equal(empty.stored, true);
    assert.equal(empty.record.targets.lifestyle, 10000);
    assert.deepEqual(empty.record.manual, {});
    assert.equal(saved, null);
    const put = await potPut(new Request('http://localhost/api/cockpit/jrl/pots', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ manual: { emergency: { amount: 0, asOf: '2026-11-01' } } }),
    }), { env, openAppStore });
    assert.equal(put.status, 200);
    const again = await potGet(new Request('http://localhost/api/cockpit/jrl/pots', { headers }), { env, openAppStore });
    const body = await again.json();
    assert.equal(body.record.manual.emergency.amount, 0);
    assert.equal(body.record.manual.lifestyle, undefined);
  } finally {
    if (previous == null) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous;
  }
});
