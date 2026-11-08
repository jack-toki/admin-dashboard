const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { jrlGet, jrlWrite } = require('../lib/jrl/http');
const { signSession, cookieName } = require('../lib/auth');
const {
  OWNER_LINK_RISK,
  accessFromOwnerLink,
  establishOwnerLink,
  expectedOwnerSub,
  memoryOwnerStore,
  ownerLinkEnabled,
  ownerLinkStore,
  rejectCrossSiteMutation,
  revokeOwnerLink,
  subjectFromAccessToken,
} = require('../lib/jrl/ownerLink');
const { JRL_COOKIE, sealJrlSession } = require('../lib/jrl/session');
const { openFileStore } = require('../lib/store/fileStore');
const { compareAndSwapOauthToken, readOauthToken } = require('../lib/store/tokenCas');
const { POST, DELETE } = require('../app/api/cockpit/jrl/session/route');

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const TABLES = [
  ['monthly_entry', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']],
  ['finance_target', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']],
  ['finance_setting', ['SELECT', 'INSERT', 'UPDATE']],
  ['purchase', ['SELECT', 'INSERT', 'DELETE']],
  ['sora_conversation', ['SELECT', 'DELETE']],
  ['sora_research', ['SELECT', 'DELETE']],
  ['sora_alerts', ['SELECT']],
];
const REVIEW_SQL = [
  'supabase/jrl_owner_boundary.sql',
  'supabase/jrl_owner_boundary_rollback.sql',
  'supabase/jrl_owner_boundary_denial.sql',
  'supabase/jrl_owner_link_store.sql',
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
  JRL_OWNER_SUB: OWNER,
  NODE_ENV: 'test',
};

function ownerSession(sub, refreshToken, expiresAt = Date.now() - 1000) {
  return { accessToken: jwt({ sub, role: 'authenticated' }), refreshToken, expiresAt };
}

function tokenResponse(sub, refreshToken) {
  return {
    ok: true,
    json: async () => ({
      access_token: jwt({ sub, role: 'authenticated' }),
      refresh_token: refreshToken,
      expires_in: 3600,
    }),
  };
}

function rootFile(name) {
  return path.join(__dirname, '..', name);
}

test('the owner boundary covers every audited command and does not guess an identity', () => {
  const sql = fs.readFileSync(rootFile('supabase/jrl_owner_boundary.sql'), 'utf8');
  const rollback = fs.readFileSync(rootFile('supabase/jrl_owner_boundary_rollback.sql'), 'utf8');
  const denial = fs.readFileSync(rootFile('supabase/jrl_owner_boundary_denial.sql'), 'utf8');
  for (const file of [sql, rollback, denial]) {
    assert.match(file, /NOT APPLIED/);
    assert.equal(file.replace(/00000000-0000-4000-8000-000000000002/g, '').includes('you@example.com'), false);
    assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(file), false);
  }
  assert.match(sql, /auth\.uid\(\) = \(select owner_sub from public\.jrl_owner_pin where id\)/);
  assert.match(sql, /preflight_owner_sub_missing/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = pg_catalog, public/);
  assert.match(sql, /postflight_owner_helper_unsafe/);
  assert.match(sql, /postflight_pin_grant/);
  assert.match(sql, /postflight_view_privilege/);
  assert.match(sql, /postflight_view_dependency_unexpected/);
  assert.match(sql, /postflight_policy_count/);
  assert.equal(/current_setting\('app\.jrl_owner_sub'/.test(sql.split('create or replace function')[1].split('revoke all on function')[0]), false);
  assert.equal(/auth\.email\(\)/.test(sql), false);
  assert.equal(/for all to authenticated/i.test(sql), false);
  assert.equal(/create policy[\s\S]*to anon/i.test(sql), false);
  assert.match(sql, /does not ALTER ROLE/);
  assert.match(sql, /for insert to authenticated with check \(public\.jrl_is_owner\(\)\)/);
  assert.match(sql, /for update to authenticated using \(public\.jrl_is_owner\(\)\) with check \(public\.jrl_is_owner\(\)\)/);
  assert.match(sql, /for delete to authenticated using \(public\.jrl_is_owner\(\)\)/);
  assert.match(sql, /for select to authenticated using \(public\.jrl_is_owner\(\)\)/);
  const expected = TABLES.flatMap(([table, commands]) => commands.map((command) => `${table} ${command}`));
  const found = [...sql.matchAll(/\('([a-z_]+)', '([A-Z]+)'\)/g)].map((match) => `${match[1]} ${match[2]}`);
  assert.deepEqual([...new Set(found)].sort(), [...expected].sort());
  assert.equal(expected.length, 19);
  assert.equal(sql.includes("('finance_setting', 'DELETE')"), false);
  assert.equal(sql.includes("('purchase', 'UPDATE')"), false);
  assert.equal(sql.includes("('sora_alerts', 'INSERT')"), false);
  assert.match(rollback, /drop function if exists public\.jrl_is_owner/);
  assert.match(rollback, /drop table if exists public\.jrl_owner_pin/);
  assert.match(denial, /app\.jrl_owner_sub/);
  assert.match(denial, /denial_pin_write_succeeded/);
  assert.match(denial, /denial_helper_replace_succeeded/);
  assert.match(denial, /do not select the row bodies/i);
  for (const [table, commands] of TABLES) {
    for (const command of commands) {
      assert.match(sql, new RegExp(`'${table}', '${command}'`));
      assert.match(rollback, new RegExp(`${table}_${command.toLowerCase()}`));
      assert.match(denial, new RegExp(`${table}_other_owner`));
    }
  }
  assert.match(denial, /monthly_finance_anon/);
  const manifest = fs.readFileSync(rootFile('supabase/jrl_owner_review_sha256.txt'), 'utf8').trim().split('\n');
  assert.equal(manifest.length, REVIEW_SQL.length);
  manifest.forEach((line, index) => {
    const [hash, file] = line.split(/\s+/);
    assert.equal(file, REVIEW_SQL[index]);
    const digest = crypto.createHash('sha256').update(fs.readFileSync(rootFile(file))).digest('hex');
    assert.equal(digest, hash);
  });
});

test('the owner link stays off and a cockpit session does not read the ledger', async () => {
  assert.equal(ownerLinkEnabled({}), false);
  assert.equal(expectedOwnerSub({}), null);
  assert.equal(subjectFromAccessToken(jwt({ sub: OWNER, role: 'service_role' })), null);
  assert.equal(subjectFromAccessToken(jwt({ sub: OWNER, role: 'anon' })), null);
  const store = memoryOwnerStore();
  await establishOwnerLink({ store, env, session: ownerSession(OWNER, 'refresh-secret', Date.now() + 60_000) });
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

test('a configured owner rotates once across two instances and keeps a token when refresh fails', async () => {
  const store = memoryOwnerStore();
  const missing = await establishOwnerLink({
    store,
    env: { ...env, JRL_OWNER_SUB: '' },
    session: ownerSession(OWNER, 'refresh-1'),
  });
  assert.equal(missing.error, 'owner_sub_not_configured');
  assert.equal(await store.read(), null);
  const other = await establishOwnerLink({ store, env, session: ownerSession(OTHER, 'refresh-other') });
  assert.equal(other.error, 'cross_owner');
  assert.equal(await store.read(), null);
  const established = await establishOwnerLink({ store, env, session: ownerSession(OWNER, 'refresh-1') });
  assert.equal(established.ok, true);
  assert.equal(JSON.stringify(established).includes('refresh-1'), false);

  let refreshes = 0;
  const fetchImpl = async (url, init) => {
    if (String(url).includes('grant_type=refresh_token')) {
      refreshes += 1;
      assert.equal(JSON.parse(init.body).refresh_token, 'refresh-1');
      await new Promise((resolve) => setTimeout(resolve, 30));
      return tokenResponse(OWNER, 'refresh-2');
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

  const crashed = await store.read();
  await store.cas(crashed.generation, {
    ...crashed,
    refreshToken: 'refresh-2',
    phase: 'rotating',
    rotatingUntil: Date.now() - 1000,
  });
  const recovered = await accessFromOwnerLink({
    store,
    env,
    now: Date.now(),
    fetchImpl: async () => tokenResponse(OWNER, 'refresh-3'),
  });
  assert.equal(recovered.ok, true);
  assert.equal((await store.read()).refreshToken, 'refresh-3');

  const before = await store.read();
  await store.cas(before.generation, { ...before, expiresAt: Date.now() - 1000, phase: 'ready' });
  const unavailable = await accessFromOwnerLink({
    store,
    env,
    now: Date.now(),
    fetchImpl: async () => { throw new Error('socket hang up'); },
  });
  assert.equal(unavailable.error, 'refresh_unavailable');
  assert.equal(unavailable.kept, true);
  assert.equal((await store.read()).refreshToken, 'refresh-3');
  assert.equal((await store.read()).revoked, false);
  assert.equal(JSON.stringify(unavailable).includes('refresh-3'), false);

  const rejected = await accessFromOwnerLink({
    store,
    env,
    now: Date.now() + 3_700_000,
    fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant', refresh_token: 'do-not-echo' }) }),
  });
  assert.equal(rejected.error, 'revoked');
  assert.equal((await store.read()).refreshToken, '');
  assert.equal(JSON.stringify(rejected).includes('do-not-echo'), false);
});

test('revocation allows the same owner to link again and rejects a different subject', async () => {
  const store = memoryOwnerStore();
  await establishOwnerLink({ store, env, session: ownerSession(OWNER, 'refresh-1', Date.now() + 60_000) });
  const revoked = await revokeOwnerLink(store);
  assert.equal(revoked.ok, true);
  assert.equal((await store.read()).refreshToken, '');
  const intruder = await establishOwnerLink({ store, env, session: ownerSession(OTHER, 'refresh-other', Date.now() + 60_000) });
  assert.equal(intruder.error, 'cross_owner');
  assert.equal((await store.read()).refreshToken, '');
  const again = await establishOwnerLink({ store, env, session: ownerSession(OWNER, 'refresh-4', Date.now() + 60_000) });
  assert.equal(again.ok, true);
  assert.equal((await store.read()).refreshToken, 'refresh-4');
  await store.cas((await store.read()).generation, {
    sub: OTHER,
    refreshToken: 'refresh-wrong',
    accessToken: jwt({ sub: OTHER, role: 'authenticated' }),
    expiresAt: Date.now() + 60_000,
    revoked: false,
    phase: 'ready',
  });
  const mismatch = await accessFromOwnerLink({ store, env, now: Date.now(), fetchImpl: async () => { throw new Error('should not refresh'); } });
  assert.equal(mismatch.error, 'cross_owner');
  assert.equal(mismatch.accessToken, undefined);
  assert.equal((await store.read()).refreshToken, '');
});

test('the file store refuses the owner link', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jrl-link-'));
  const fileStore = openFileStore(path.join(directory, 'store.enc'), env);
  const adapted = ownerLinkStore(fileStore);
  assert.equal(adapted.ready, false);
  assert.equal(adapted.error, 'file_store_not_shared');
  const saved = await establishOwnerLink({
    store: adapted,
    env,
    session: ownerSession(OWNER, 'refresh-secret', Date.now() + 1000),
  });
  assert.equal(saved.ok, false);
  assert.equal(saved.error, 'file_store_not_shared');
  assert.equal(fs.existsSync(path.join(directory, 'store.enc')), false);
});

test('the shared token update compares generation and fails closed when the column is missing', async () => {
  const rows = [];
  const filters = [];
  function client(error) {
    let tail = Promise.resolve();
    function exclusive(fn) {
      const run = tail.then(fn, fn);
      tail = run.then(() => {}, () => {});
      return run;
    }
    return {
      from() {
        const state = { filters: [], op: 'select', payload: null };
        const api = {
          select() { return api; },
          update(payload) { state.op = 'update'; state.payload = payload; return api; },
          insert(payload) { state.op = 'insert'; state.payload = payload; return api; },
          eq(column, value) { state.filters.push([column, value]); return api; },
          limit() { return api; },
          then(resolve, reject) {
            return exclusive(() => {
              filters.push(state.filters);
              if (error) return { data: null, error };
              const matches = (row) => state.filters.every(([column, value]) => row[column] === value);
              if (state.op === 'select') {
                return { data: rows.filter(matches).map((row) => ({ ciphertext: row.ciphertext, generation: row.generation })), error: null };
              }
              if (state.op === 'update') {
                const found = rows.filter(matches);
                if (!found.length) return { data: [], error: null };
                Object.assign(found[0], state.payload);
                return { data: [{ generation: found[0].generation }], error: null };
              }
              if (rows.some((row) => row.provider === state.payload.provider && row.tenant_key === state.payload.tenant_key)) {
                return { data: null, error: { code: '23505' } };
              }
              rows.push({
                provider: state.payload.provider,
                tenant_key: state.payload.tenant_key,
                ciphertext: state.payload.ciphertext,
                generation: state.payload.generation,
              });
              return { data: [{ generation: state.payload.generation }], error: null };
            }).then(resolve, reject);
          },
        };
        return api;
      },
    };
  }
  const db = client();
  const [first, second] = await Promise.all([
    compareAndSwapOauthToken(db, env, { provider: 'jrl', tenantKey: 'owner', expectedGeneration: 0, payload: { refreshToken: 'refresh-a', sub: OWNER } }),
    compareAndSwapOauthToken(db, env, { provider: 'jrl', tenantKey: 'owner', expectedGeneration: 0, payload: { refreshToken: 'refresh-b', sub: OWNER } }),
  ]);
  assert.equal([first.ok, second.ok].filter(Boolean).length, 1);
  assert.equal(rows.length, 1);
  assert.equal(JSON.stringify(rows).includes('refresh-a') || JSON.stringify(rows).includes('refresh-b'), false);
  assert.equal(filters.some((item) => item.some(([column]) => column === 'generation')), true);
  const stale = await compareAndSwapOauthToken(db, env, { provider: 'jrl', tenantKey: 'owner', expectedGeneration: 0, payload: { refreshToken: 'refresh-c', sub: OWNER } });
  assert.equal(stale.conflict, true);
  const read = await readOauthToken(db, env, { provider: 'jrl', tenantKey: 'owner' });
  assert.equal(read.record.generation, 1);
  assert.equal(read.record.refreshToken === 'refresh-a' || read.record.refreshToken === 'refresh-b', true);
  const missing = await compareAndSwapOauthToken(client({ code: '42703', message: 'column generation does not exist' }), env, {
    provider: 'jrl', tenantKey: 'owner', expectedGeneration: 0, payload: { refreshToken: 'refresh-d' },
  });
  assert.equal(missing.error, 'link_store_not_ready');
  const checked = await compareAndSwapOauthToken(client({ code: '23514', message: 'app_oauth_tokens_provider_check' }), env, {
    provider: 'jrl', tenantKey: 'owner', expectedGeneration: 0, payload: { refreshToken: 'refresh-e' },
  });
  assert.equal(checked.error, 'link_store_not_ready');
});

test('ledger reads and writes use the stored owner and do not refresh the browser cookie', async () => {
  const store = memoryOwnerStore();
  await establishOwnerLink({ store, env, session: ownerSession(OWNER, 'refresh-stored') });
  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = env.DASHBOARD_SESSION_SECRET;
  const cockpit = signSession({ role: 'admin', areas: ['jrl'] }, env);
  const sealed = sealJrlSession({ accessToken: jwt({ sub: OWNER, role: 'authenticated' }), refreshToken: 'refresh-cookie', expiresAt: Date.now() - 1000 }, env);
  const headers = { cookie: `${cookieName()}=${cockpit}; ${JRL_COOKIE}=${sealed}` };
  let refreshed = [];
  try {
    const res = await jrlGet(new Request('http://localhost/api/cockpit/jrl', { headers }), {
      env,
      ownerStore: store,
      fetchImpl: async (url, init) => {
        if (String(url).includes('grant_type=refresh_token')) {
          refreshed.push(JSON.parse(init.body).refresh_token);
          return tokenResponse(OWNER, 'refresh-next');
        }
        return { ok: true, json: async () => [] };
      },
    });
    const body = await res.json();
    assert.equal(body.auth.supabaseUser, true);
    assert.deepEqual(refreshed, ['refresh-stored']);
    assert.equal(res.headers.get('set-cookie'), null);
    assert.equal(JSON.stringify(body).includes('refresh-stored'), false);
    assert.equal(JSON.stringify(body).includes('refresh-cookie'), false);
    assert.equal(JSON.stringify(body).includes('refresh-next'), false);

    refreshed = [];
    const write = await jrlWrite(new Request('http://localhost/api/cockpit/jrl/month', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ period: '2026-10-01', tax_in: 1 }),
    }), {
      env,
      ownerStore: store,
      now: Date.now(),
      fetchImpl: async (url, init) => {
        if (String(url).includes('grant_type=refresh_token')) refreshed.push('refresh');
        assert.equal(init.headers.Authorization, `Bearer ${(await store.read()).accessToken}`);
        return { ok: true, json: async () => ({}) };
      },
    });
    const written = await write.json();
    assert.equal(written.saved, true);
    assert.deepEqual(refreshed, []);
    assert.equal(JSON.stringify(written).includes('refresh-next'), false);
  } finally {
    if (previous == null) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous;
  }
});

test('a cross-site link or unlink is rejected and an unconfigured owner is not stored', async () => {
  const previous = {
    secret: process.env.DASHBOARD_SESSION_SECRET,
    link: process.env.JRL_OWNER_LINK,
    sub: process.env.JRL_OWNER_SUB,
    url: process.env.JRL_SUPABASE_URL,
    key: process.env.JRL_SUPABASE_ANON_KEY,
    store: process.env.APP_STORE,
    storePath: process.env.APP_STORE_PATH,
    tokenKey: process.env.APP_TOKEN_ENCRYPTION_KEY,
    nodeEnv: process.env.NODE_ENV,
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jrl-route-'));
  const fetchImpl = global.fetch;
  let calls = 0;
  process.env.DASHBOARD_SESSION_SECRET = env.DASHBOARD_SESSION_SECRET;
  process.env.JRL_OWNER_LINK = 'on';
  process.env.JRL_OWNER_SUB = OWNER;
  process.env.JRL_SUPABASE_URL = env.JRL_SUPABASE_URL;
  process.env.JRL_SUPABASE_ANON_KEY = env.JRL_SUPABASE_ANON_KEY;
  process.env.APP_TOKEN_ENCRYPTION_KEY = env.APP_TOKEN_ENCRYPTION_KEY;
  process.env.APP_STORE = 'file';
  process.env.APP_STORE_PATH = path.join(directory, 'store.enc');
  process.env.NODE_ENV = 'test';
  global.fetch = async (url) => {
    calls += 1;
    if (String(url).includes('grant_type=password')) return tokenResponse(OWNER, 'refresh-from-provider');
    throw new Error('unexpected fetch');
  };
  const cockpit = signSession({ role: 'admin', areas: ['jrl'] }, env);
  function request(method, headers, body) {
    return new Request('http://localhost/api/cockpit/jrl/session', {
      method,
      headers: { cookie: `${cookieName()}=${cockpit}`, ...headers },
      body,
    });
  }
  try {
    const forged = await POST(request('POST', {
      origin: 'https://evil.example',
      'content-type': 'application/json',
      'sec-fetch-site': 'cross-site',
      'x-cockpit-link': '1',
    }, JSON.stringify({ email: 'person@example.com', password: 'secret-pass', refresh_token: 'planted-token' })));
    assert.equal(forged.status, 403);
    assert.equal(calls, 0);
    const forgedBody = await forged.text();
    assert.equal(forgedBody.includes('planted-token'), false);
    assert.equal(forgedBody.includes('secret-pass'), false);
    assert.equal(forged.headers.get('set-cookie'), null);

    const missingHeader = await POST(request('POST', {
      origin: 'http://localhost',
      'content-type': 'application/json',
    }, JSON.stringify({ email: 'person@example.com', password: 'secret-pass' })));
    assert.equal(missingHeader.status, 403);
    assert.equal(calls, 0);

    const unlink = await DELETE(request('DELETE', { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }));
    assert.equal(unlink.status, 403);
    assert.equal(fs.existsSync(process.env.APP_STORE_PATH), false);

    delete process.env.JRL_OWNER_SUB;
    const unconfigured = await POST(request('POST', {
      origin: 'http://localhost',
      'content-type': 'application/json',
      'x-cockpit-link': '1',
    }, JSON.stringify({ email: 'person@example.com', password: 'secret-pass' })));
    assert.equal(unconfigured.status, 403);
    const unconfiguredBody = await unconfigured.json();
    assert.equal(unconfiguredBody.error, 'owner_sub_not_configured');
    assert.equal(unconfigured.headers.get('set-cookie'), null);
    assert.equal(JSON.stringify(unconfiguredBody).includes('refresh-from-provider'), false);

    process.env.JRL_OWNER_SUB = OTHER;
    global.fetch = async () => {
      calls += 1;
      return tokenResponse(OWNER, 'refresh-from-provider');
    };
    const wrong = await POST(request('POST', {
      origin: 'http://localhost',
      'content-type': 'application/json',
      'x-cockpit-link': '1',
    }, JSON.stringify({ email: 'person@example.com', password: 'secret-pass' })));
    assert.equal(wrong.status, 403);
    const wrongBody = await wrong.json();
    assert.equal(wrongBody.error, 'cross_owner');
    assert.equal(wrong.headers.get('set-cookie'), null);
    assert.equal(fs.existsSync(process.env.APP_STORE_PATH), false);

    process.env.JRL_OWNER_SUB = OWNER;
    const accepted = await POST(request('POST', {
      origin: 'http://localhost',
      'content-type': 'application/json',
      'x-cockpit-link': '1',
    }, JSON.stringify({ email: 'person@example.com', password: 'secret-pass' })));
    const acceptedBody = await accepted.json();
    assert.equal(accepted.status, 200);
    assert.equal(acceptedBody.linked, false);
    assert.equal(JSON.stringify(acceptedBody).includes('refresh-from-provider'), false);
    if (fs.existsSync(process.env.APP_STORE_PATH)) {
      assert.equal(fs.readFileSync(process.env.APP_STORE_PATH, 'utf8').includes('refresh-from-provider'), false);
    }
    assert.match(fs.readFileSync(rootFile('app/cockpit/jrl/login/JrlLoginForm.js'), 'utf8'), /x-cockpit-link/);
    assert.match(fs.readFileSync(rootFile('app/cockpit/ui/JrlScreen.js'), 'utf8'), /x-cockpit-link/);
    assert.equal(rejectCrossSiteMutation(request('POST', { origin: 'http://localhost', 'x-cockpit-link': '1' })).ok, true);
  } finally {
    global.fetch = fetchImpl;
    for (const [key, value] of Object.entries({
      DASHBOARD_SESSION_SECRET: previous.secret,
      JRL_OWNER_LINK: previous.link,
      JRL_OWNER_SUB: previous.sub,
      JRL_SUPABASE_URL: previous.url,
      JRL_SUPABASE_ANON_KEY: previous.key,
      APP_STORE: previous.store,
      APP_STORE_PATH: previous.storePath,
      APP_TOKEN_ENCRYPTION_KEY: previous.tokenKey,
      NODE_ENV: previous.nodeEnv,
    })) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
