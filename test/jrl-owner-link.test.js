const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { jrlGet } = require('../lib/jrl/http');
const { signSession, cookieName } = require('../lib/auth');
const {
  OWNER_LINK_RISK,
  accessFromOwnerLink,
  establishOwnerLink,
  memoryOwnerStore,
  ownerLinkEnabled,
  subjectFromAccessToken,
} = require('../lib/jrl/ownerLink');
const { openFileStore } = require('../lib/store/fileStore');

const TABLES = [
  ['monthly_entry', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']],
  ['finance_target', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']],
  ['finance_setting', ['SELECT', 'INSERT', 'UPDATE']],
  ['purchase', ['SELECT', 'INSERT', 'DELETE']],
  ['sora_conversation', ['SELECT', 'DELETE']],
  ['sora_research', ['SELECT', 'DELETE']],
  ['sora_alerts', ['SELECT']],
];

function jwt(payload) {
  return `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
}

const env = {
  JRL_SUPABASE_URL: 'https://uxkpqmyzxtjmmixlycio.supabase.co',
  JRL_SUPABASE_ANON_KEY: jwt({ role: 'anon', ref: 'uxkpqmyzxtjmmixlycio' }),
  DASHBOARD_SESSION_SECRET: 'session-secret-for-test',
  APP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  JRL_OWNER_LINK: 'on',
  NODE_ENV: 'test',
};

test('the owner boundary covers every audited command and does not guess an identity', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'jrl_owner_boundary.sql'), 'utf8');
  const rollback = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'jrl_owner_boundary_rollback.sql'), 'utf8');
  const denial = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'jrl_owner_boundary_denial.sql'), 'utf8');
  for (const file of [sql, rollback, denial]) {
    assert.match(file, /NOT APPLIED/);
    assert.equal(file.replace(/00000000-0000-4000-8000-000000000002/g, '').includes('you@example.com'), false);
    assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(file), false);
  }
  assert.match(sql, /auth\.uid\(\)::text/);
  assert.match(sql, /app\.jrl_owner_sub/);
  assert.equal(/auth\.email\(\)/.test(sql), false);
  assert.equal(/for all to authenticated/i.test(sql), false);
  assert.equal(/create policy[\s\S]*to anon/i.test(sql), false);
  assert.equal(/service_role/.test(sql), true);
  assert.match(sql, /does not ALTER ROLE/);
  assert.match(sql, /preflight_view_dependency_unexpected/);
  assert.match(sql, /postflight_anon_policy/);
  assert.match(sql, /security_invoker = on/);
  for (const [table, commands] of TABLES) {
    for (const command of commands) {
      assert.match(sql, new RegExp(`'${table}', '${command}'`));
      assert.match(rollback, new RegExp(`${table}_${command.toLowerCase()}`));
      assert.match(denial, new RegExp(`${table}_other_owner`));
    }
  }
  assert.match(denial, /monthly_finance_anon/);
  assert.match(denial, /do not select the row bodies/i);
});

test('the owner link stays off and a cockpit session does not read the ledger', async () => {
  assert.equal(ownerLinkEnabled({}), false);
  assert.equal(subjectFromAccessToken(jwt({ sub: 'owner-1', role: 'service_role' })), null);
  assert.equal(subjectFromAccessToken(jwt({ sub: 'owner-1', role: 'anon' })), null);
  const store = memoryOwnerStore();
  await store.cas(0, {
    sub: 'owner-1',
    refreshToken: 'refresh-secret',
    accessToken: jwt({ sub: 'owner-1', role: 'authenticated' }),
    expiresAt: Date.now() + 60_000,
    revoked: false,
  });
  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = env.DASHBOARD_SESSION_SECRET;
  let calls = 0;
  try {
    const cockpit = signSession({ role: 'admin', areas: ['jrl'] }, env);
    const res = await jrlGet(new Request('http://localhost/api/cockpit/jrl', {
      headers: { cookie: `${cookieName()}=${cockpit}` },
    }), {
      env: { ...env, JRL_OWNER_LINK: 'off' },
      ownerStore: store,
      fetchImpl: async () => { calls += 1; return { ok: true, json: async () => [] }; },
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(calls, 0);
    assert.equal(body.auth.supabaseUser, false);
    assert.equal(body.entries.length, 0);
    assert.equal(body.balances, null);
    assert.equal(JSON.stringify(body).includes('refresh-secret'), false);
  } finally {
    if (previous == null) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous;
  }
});

test('a linked owner session rotates once and rejects a different subject', async () => {
  const store = memoryOwnerStore();
  const first = jwt({ sub: 'owner-1', role: 'authenticated' });
  const established = await establishOwnerLink({
    store,
    env,
    session: { accessToken: first, refreshToken: 'refresh-1', expiresAt: Date.now() - 1000 },
  });
  assert.equal(established.ok, true);
  const other = await establishOwnerLink({
    store,
    env,
    session: { accessToken: jwt({ sub: 'owner-2', role: 'authenticated' }), refreshToken: 'refresh-2', expiresAt: Date.now() + 1000 },
  });
  assert.equal(other.error, 'cross_owner');
  assert.equal((await store.read()).sub, 'owner-1');
  let refreshes = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes('grant_type=refresh_token')) {
      refreshes += 1;
      return {
        ok: true,
        json: async () => ({
          access_token: jwt({ sub: 'owner-1', role: 'authenticated' }),
          refresh_token: 'refresh-2',
          expires_in: 3600,
        }),
      };
    }
    return { ok: true, json: async () => [] };
  };
  const [one, two] = await Promise.all([
    accessFromOwnerLink({ store, env, fetchImpl, now: Date.now() }),
    accessFromOwnerLink({ store, env, fetchImpl, now: Date.now() }),
  ]);
  assert.equal(one.ok, true);
  assert.equal(two.ok, true);
  assert.equal(refreshes, 1);
  assert.equal((await store.read()).refreshToken, 'refresh-2');
  const mismatch = await accessFromOwnerLink({
    store,
    env,
    now: Date.now() + 3_700_000,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        access_token: jwt({ sub: 'owner-2', role: 'authenticated' }),
        refresh_token: 'refresh-3',
        expires_in: 3600,
      }),
    }),
  });
  assert.equal(mismatch.error, 'cross_owner');
  assert.equal((await store.read()).revoked, true);
  assert.equal((await store.read()).refreshToken, '');

  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = env.DASHBOARD_SESSION_SECRET;
  process.env.JRL_OWNER_LINK = 'on';
  try {
    const cockpit = signSession({ role: 'admin', areas: ['jrl'] }, env);
    const closed = await jrlGet(new Request('http://localhost/api/cockpit/jrl'), { env, ownerStore: store });
    assert.equal(closed.status, 401);
    const res = await jrlGet(new Request('http://localhost/api/cockpit/jrl', {
      headers: { cookie: `${cookieName()}=${cockpit}` },
    }), {
      env,
      ownerStore: memoryOwnerStore(),
      fetchImpl: async () => { throw new Error('should not read'); },
    });
    const body = await res.json();
    assert.equal(body.auth.supabaseUser, false);
    assert.equal(body.auth.ownerLinkRisk, OWNER_LINK_RISK);
    assert.equal(body.entries.length, 0);
  } finally {
    delete process.env.JRL_OWNER_LINK;
    if (previous == null) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous;
  }
});

test('the file store keeps the owner refresh token encrypted', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jrl-link-'));
  const store = openFileStore(path.join(directory, 'store.enc'), env);
  const adapted = {
    ready: true,
    read: () => store.readToken({ provider: 'jrl', tenantKey: 'owner' }),
    cas: (expectedGeneration, record) => store.compareAndSwapToken({
      provider: 'jrl', tenantKey: 'owner', expectedGeneration, payload: record,
    }),
  };
  const saved = await establishOwnerLink({
    store: adapted,
    env,
    session: { accessToken: jwt({ sub: 'owner-1', role: 'authenticated' }), refreshToken: 'refresh-secret', expiresAt: Date.now() + 1000 },
  });
  assert.equal(saved.ok, true);
  const raw = fs.readFileSync(path.join(directory, 'store.enc'), 'utf8');
  assert.equal(raw.includes('refresh-secret'), false);
  assert.equal((await adapted.read()).sub, 'owner-1');
});
