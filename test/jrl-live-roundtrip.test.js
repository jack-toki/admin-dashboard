const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { verifyJrlEmailCode } = require('../lib/jrl/emailOtp');
const { ownerLinkStore } = require('../lib/jrl/ownerLink');
const { jrlGet } = require('../lib/jrl/http');
const { potGet, potPut } = require('../lib/cockpit/http');
const { openAppStore } = require('../lib/store');
const { decryptToken, encryptToken } = require('../lib/xero/oauth');
const { signSession, cookieName } = require('../lib/auth');

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ADDRESS = 'owner@example.com';
const REFRESH = 'otp-refresh-fixture';
const SNAKE_REFRESH = 'snake-refresh-fixture';
const TOKI = 'hcjybjpimqzsueyslxvl.supabase.co';
const JRL = 'uxkpqmyzxtjmmixlycio.supabase.co';

function serviceKey() {
  const body = Buffer.from(JSON.stringify({ role: 'service_role', ref: 'hcjybjpimqzsueyslxvl', nonce: 'roundtrip' })).toString('base64url');
  return `e30.${body}.sig`;
}

function anonKey() {
  const body = Buffer.from(JSON.stringify({ role: 'anon', ref: 'uxkpqmyzxtjmmixlycio' })).toString('base64url');
  return `eyJhbGciOiJub25lIn0.${body}.sig`;
}

function userJwt(sub) {
  const body = Buffer.from(JSON.stringify({ sub, role: 'authenticated', nonce: 'ledger-user' })).toString('base64url');
  return `eyJhbGciOiJub25lIn0.${body}.sig`;
}

function claims(authorization) {
  const token = String(authorization || '').replace(/^Bearer\s+/i, '');
  const part = token.split('.')[1];
  if (!part) return { role: null, sub: null };
  try {
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return { role: payload.role || null, sub: payload.sub || null };
  } catch {
    return { role: null, sub: null };
  }
}

function envFor(extra = {}) {
  return {
    APP_STORE: 'supabase',
    SUPABASE_URL: `https://${TOKI}`,
    SUPABASE_SERVICE_KEY: serviceKey(),
    COCKPIT_DB_SCHEMA: 'cockpit',
    APP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString('base64'),
    DASHBOARD_SESSION_SECRET: 'session-secret-for-live-roundtrip',
    JRL_OWNER_LINK: 'on',
    JRL_OWNER_SUB: OWNER,
    JRL_OWNER_EMAIL: ADDRESS,
    JRL_SUPABASE_URL: `https://${JRL}`,
    JRL_SUPABASE_ANON_KEY: anonKey(),
    NODE_ENV: 'test',
    ...extra,
  };
}

function projectColumns(row, select) {
  const copy = { ...row };
  if (copy.document && typeof copy.document === 'object') copy.document = JSON.stringify(copy.document);
  if (!select || select === '*') return copy;
  const out = {};
  for (const column of select.split(',')) {
    if (Object.prototype.hasOwnProperty.call(copy, column)) out[column] = copy[column];
  }
  return out;
}

function matches(row, params, state) {
  for (const [key, value] of params.entries()) {
    if (['select', 'limit', 'on_conflict', 'order', 'offset'].includes(key)) continue;
    const dot = String(value).indexOf('.');
    if (dot < 0) continue;
    const op = value.slice(0, dot);
    const raw = value.slice(dot + 1);
    if (state?.tokenFilterMiss && key === 'tenant_key') return false;
    if (op === 'eq' && (raw === 'true' || raw === 'false') && typeof row[key] === 'boolean') return false;
    if (op === 'eq' && String(row[key]) !== raw) return false;
    if (op === 'is' && raw === 'null' && row[key] != null) return false;
    if (op === 'is' && raw === 'true' && row[key] !== true) return false;
    if (op === 'is' && raw === 'false' && row[key] !== false) return false;
  }
  return true;
}

function listen(state) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const host = String(req.headers['x-upstream-host'] || '');
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = raw ? JSON.parse(raw) : null;
      const authorization = req.headers.authorization || '';
      state.calls.push({
        method: req.method,
        host,
        path: url.pathname,
        search: url.search,
        profile: req.headers['accept-profile'] || req.headers['content-profile'] || '',
        auth: claims(authorization),
        apikeyRole: claims(req.headers.apikey || '').role,
      });
      const send = (status, payload) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (host === JRL && url.pathname === '/auth/v1/verify') {
        const requested = body?.token_hash ? 'hash' : 'code';
        const subject = state.verifySubject;
        send(200, {
          access_token: userJwt(subject),
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: requested === 'hash' ? REFRESH : 'unexpected-code-refresh',
          user: { id: subject, email: ADDRESS, role: 'authenticated' },
        });
        return;
      }
      if (host === JRL && url.pathname === '/auth/v1/token') {
        send(500, { error: 'refresh_not_expected' });
        return;
      }
      if (host === JRL && url.pathname === '/rest/v1/monthly_finance') {
        send(200, [{ period: '2026-11-01', tax_in: 1, savings_in: 0, hl_in: 0, savings_out: 0, hl_value: 4 }]);
        return;
      }
      if (host !== TOKI) {
        send(404, { code: 'no_route', message: url.pathname });
        return;
      }
      const profile = req.headers['accept-profile'] || req.headers['content-profile'];
      if (profile !== 'cockpit') {
        send(406, { code: 'PGRST106', message: 'schema not exposed' });
        return;
      }
      const table = url.pathname.split('/').pop();
      const rows = state.tables[table] || (state.tables[table] = []);
      const limit = Number(url.searchParams.get('limit') || 0);
      const select = url.searchParams.get('select');
      if (req.method === 'GET') {
        let found = rows.filter((row) => matches(row, url.searchParams, state));
        if (limit > 0) found = found.slice(0, limit);
        const projected = found.map((row) => projectColumns(row, select));
        const asObject = (table === 'app_oauth_tokens' && state.tokenEnvelope === 'object')
          || (table === 'jrl_pot_preferences' && state.potEnvelope === 'object');
        if (asObject) {
          send(projected.length === 1 ? 200 : 406, projected.length === 1 ? projected[0] : { code: 'PGRST116', message: 'object required one row' });
          return;
        }
        send(200, projected);
        return;
      }
      if (req.method === 'POST') {
        const incoming = Array.isArray(body) ? body : [body];
        const saved = [];
        for (const row of incoming) {
          const index = rows.findIndex((item) => item.id === row.id || (item.provider === row.provider && item.tenant_key === row.tenant_key));
          if (index >= 0 && !url.searchParams.get('on_conflict')) {
            send(409, { code: '23505', message: 'duplicate' });
            return;
          }
          const next = { created_at: '2026-11-09T02:41:34Z', ...rows[index], ...row };
          if (index >= 0) rows[index] = next;
          else rows.push(next);
          saved.push(projectColumns(next, select));
        }
        state.tables[table] = rows;
        send(201, saved);
        return;
      }
      if (req.method === 'PATCH') {
        const index = rows.findIndex((row) => matches(row, url.searchParams, state));
        if (index < 0) {
          send(200, []);
          return;
        }
        rows[index] = { ...rows[index], ...body };
        send(200, [projectColumns(rows[index], select)]);
        return;
      }
      send(405, { message: 'method' });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function redirectFetch(port, previous) {
  return (input, init = {}) => {
    const raw = typeof input === 'string' ? input : input.url;
    const target = new URL(raw);
    const host = target.host;
    target.protocol = 'http:';
    target.hostname = '127.0.0.1';
    target.port = String(port);
    const headers = new Headers(init.headers || {});
    headers.set('x-upstream-host', host);
    return previous(target, { ...init, headers });
  };
}

const ROOT = path.join(__dirname, '..');
const CHILD = `
const port = process.env.PORT;
const previous = global.fetch;
global.fetch = (input, init = {}) => {
  const raw = typeof input === 'string' ? input : input.url;
  const target = new URL(raw);
  const host = target.host;
  target.protocol = 'http:';
  target.hostname = '127.0.0.1';
  target.port = port;
  const headers = new Headers(init.headers || {});
  headers.set('x-upstream-host', host);
  return previous(target, { ...init, headers });
};
const env = {
  APP_STORE: 'supabase',
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
  COCKPIT_DB_SCHEMA: 'cockpit',
  APP_TOKEN_ENCRYPTION_KEY: process.env.APP_TOKEN_ENCRYPTION_KEY,
  DASHBOARD_SESSION_SECRET: process.env.DASHBOARD_SESSION_SECRET,
  JRL_OWNER_LINK: 'on',
  JRL_OWNER_SUB: process.env.JRL_OWNER_SUB,
  JRL_OWNER_EMAIL: process.env.JRL_OWNER_EMAIL,
  JRL_SUPABASE_URL: process.env.JRL_SUPABASE_URL,
  JRL_SUPABASE_ANON_KEY: process.env.JRL_SUPABASE_ANON_KEY,
  NODE_ENV: 'test',
};
(async () => {
  const { signSession, cookieName } = require(${JSON.stringify(path.join(ROOT, 'lib', 'auth'))});
  const cockpit = signSession({ role: 'admin', areas: ['jrl'] }, env);
  const headers = { cookie: cookieName() + '=' + cockpit };
  if (process.env.PHASE === 'pots') {
    const { potGet } = require(${JSON.stringify(path.join(ROOT, 'lib', 'cockpit', 'http'))});
    const res = await potGet(new Request('http://localhost/api/cockpit/jrl/pots', { headers }), { env });
    const body = await res.json();
    process.stdout.write(JSON.stringify({
      status: res.status,
      stored: body.stored === true,
      lifestyle: body.record && body.record.targets ? body.record.targets.lifestyle : null,
      shortTerm: body.record && body.record.targets ? body.record.targets.short_term : null,
      emergency: body.record && body.record.targets ? body.record.targets.emergency : null,
      investments: body.record && body.record.targets ? body.record.targets.investments : null,
      manual: body.record ? body.record.manual : null,
    }));
    return;
  }
  const { jrlGet } = require(${JSON.stringify(path.join(ROOT, 'lib', 'jrl', 'http'))});
  const res = await jrlGet(new Request('http://localhost/api/cockpit/jrl', { headers }), { env, now: Date.now() });
  const body = await res.json();
  const packed = JSON.stringify(body);
  process.stdout.write(JSON.stringify({
    status: res.status,
    supabaseUser: body.auth && body.auth.supabaseUser === true,
    subject: body.auth ? body.auth.subject : null,
    connected: body.source ? body.source.connected === true : false,
    ledger: body.source ? body.source.ledger : null,
    linkError: body.auth ? body.auth.linkError || null : null,
    rowPresent: !!(body.auth && body.auth.link && body.auth.link.rowPresent),
    decrypted: !!(body.auth && body.auth.link && body.auth.link.decrypted),
    fieldNames: body.auth && body.auth.link ? body.auth.link.fieldNames : [],
    serviceRole: body.auth ? body.auth.serviceRoleUsed === true : true,
    entries: Array.isArray(body.entries) ? body.entries.length : -1,
    leaked: packed.includes(process.env.REFRESH_MARK) || packed.includes(process.env.SNAKE_MARK),
  }));
})().catch((error) => {
  process.stderr.write(String(error && error.stack || error));
  process.exit(1);
});
`;

function fresh(port, env, phase) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', CHILD], {
      cwd: '/workspace',
      env: {
        PATH: process.env.PATH,
        PORT: String(port),
        PHASE: phase,
        SUPABASE_URL: env.SUPABASE_URL,
        SUPABASE_SERVICE_KEY: env.SUPABASE_SERVICE_KEY,
        APP_TOKEN_ENCRYPTION_KEY: env.APP_TOKEN_ENCRYPTION_KEY,
        DASHBOARD_SESSION_SECRET: env.DASHBOARD_SESSION_SECRET,
        JRL_OWNER_SUB: env.JRL_OWNER_SUB,
        JRL_OWNER_EMAIL: env.JRL_OWNER_EMAIL,
        JRL_SUPABASE_URL: env.JRL_SUPABASE_URL,
        JRL_SUPABASE_ANON_KEY: env.JRL_SUPABASE_ANON_KEY,
        REFRESH_MARK: REFRESH,
        SNAKE_MARK: SNAKE_REFRESH,
      },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(err || out || `child ${code}`));
      else resolve(JSON.parse(out));
    });
  });
}

test('otp verification, postgrest envelopes, and pot preferences round-trip through a fresh process', async () => {
  const state = {
    tables: { app_oauth_tokens: [], jrl_pot_preferences: [] },
    calls: [],
    verifySubject: OTHER,
    tokenEnvelope: 'array',
    potEnvelope: 'array',
    tokenFilterMiss: false,
  };
  const server = await listen(state);
  const port = server.address().port;
  const previous = global.fetch;
  global.fetch = redirectFetch(port, previous);
  const env = envFor();
  const cockpit = signSession({ role: 'admin', areas: ['jrl'] }, env);
  const headers = { cookie: `${cookieName()}=${cockpit}`, 'content-type': 'application/json' };
  try {
    const opened = openAppStore(env);
    assert.equal(opened.ok, true);
    const store = ownerLinkStore(opened.store);
    const rejected = await verifyJrlEmailCode({
      email: ADDRESS,
      tokenHash: 'foreign-hash',
      env,
      store,
      fetchImpl: global.fetch,
    });
    assert.equal(rejected.error, 'cross_owner');
    assert.equal(state.tables.app_oauth_tokens.length, 0);
    assert.equal(state.calls.some((call) => call.path.includes('monthly_finance')), false);

    state.verifySubject = OWNER;
    state.calls.length = 0;
    const linked = await verifyJrlEmailCode({
      email: ADDRESS,
      tokenHash: 'gmail-link-hash',
      env,
      store,
      fetchImpl: global.fetch,
    });
    assert.equal(linked.ok, true);
    assert.equal(linked.subject, OWNER);
    assert.equal(JSON.stringify(linked).includes(REFRESH), false);
    const verify = state.calls.find((call) => call.path === '/auth/v1/verify');
    assert.equal(verify.apikeyRole, 'anon');
    const row = state.tables.app_oauth_tokens[0];
    assert.equal(row.provider, 'jrl');
    assert.equal(row.tenant_key, 'owner');
    assert.equal(Number(row.generation), 1);
    assert.notEqual(row.ciphertext, 'revoked');
    const decoded = decryptToken(row.ciphertext, env);
    assert.equal(decoded.ok, true);
    assert.deepEqual(Object.keys(decoded.payload).sort(), ['accessToken', 'expiresAt', 'generation', 'phase', 'refreshToken', 'revoked', 'sub']);
    assert.equal(decoded.payload.sub, OWNER);
    assert.equal(decoded.payload.refreshToken, REFRESH);
    const sealed = row.ciphertext;

    const read = await jrlGet(new Request('http://localhost/api/cockpit/jrl', { headers }), { env, now: Date.now() });
    const body = await read.json();
    assert.equal(body.auth.supabaseUser, true);
    assert.equal(body.auth.subject, OWNER);
    assert.equal(body.auth.ownerLink, true);
    assert.equal(body.auth.linkError, undefined);
    assert.equal(body.auth.serviceRoleUsed, false);
    assert.equal(body.source.connected, true);
    assert.equal(body.source.ledger, 'readable');
    assert.equal(body.entries.length, 1);
    assert.equal(body.auth.link.rowPresent, true);
    assert.equal(body.auth.link.decrypted, true);
    assert.equal(body.auth.link.schema, 'cockpit');
    assert.equal(body.auth.link.backend, 'supabase');
    assert.ok(body.auth.link.fieldNames.includes('refreshToken'));
    assert.ok(body.auth.link.fieldNames.includes('sub'));
    assert.equal(JSON.stringify(body).includes(REFRESH), false);
    assert.equal(JSON.stringify(body).includes(userJwt(OWNER)), false);
    assert.equal(row.ciphertext, sealed);
    assert.equal(Number(row.generation), 1);
    const ledger = state.calls.filter((call) => call.path === '/rest/v1/monthly_finance');
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].auth.role, 'authenticated');
    assert.equal(ledger[0].auth.sub, OWNER);
    assert.equal(ledger[0].apikeyRole, 'anon');
    assert.equal(state.calls.some((call) => call.path === '/auth/v1/token'), false);
    const tokenRead = state.calls.find((call) => call.path.endsWith('/app_oauth_tokens') && call.method === 'GET');
    assert.equal(tokenRead.profile, 'cockpit');

    const child = await fresh(port, env, 'jrl');
    assert.equal(child.supabaseUser, true);
    assert.equal(child.subject, OWNER);
    assert.equal(child.connected, true);
    assert.equal(child.ledger, 'readable');
    assert.equal(child.linkError, null);
    assert.equal(child.rowPresent, true);
    assert.equal(child.decrypted, true);
    assert.equal(child.serviceRole, false);
    assert.equal(child.entries, 1);
    assert.equal(child.leaked, false);
    assert.equal(row.ciphertext, sealed);
    assert.equal(Number(row.generation), 1);

    state.tokenEnvelope = 'object';
    const objectRead = await fresh(port, env, 'jrl');
    assert.equal(objectRead.supabaseUser, true);
    assert.equal(objectRead.subject, OWNER);
    assert.equal(objectRead.connected, true);
    assert.equal(row.ciphertext, sealed);
    state.tokenEnvelope = 'array';

    state.tokenFilterMiss = true;
    const missed = await fresh(port, env, 'jrl');
    assert.equal(missed.supabaseUser, true);
    assert.equal(missed.subject, OWNER);
    assert.equal(missed.connected, true);
    assert.equal(missed.rowPresent, true);
    assert.equal(row.ciphertext, sealed);
    assert.equal(Number(row.generation), 1);
    state.tokenFilterMiss = false;

    const offCalls = state.calls.length;
    const off = await jrlGet(new Request('http://localhost/api/cockpit/jrl', { headers }), {
      env: { ...env, JRL_OWNER_LINK: 'off' },
      now: Date.now(),
    });
    const closed = await off.json();
    assert.equal(closed.auth.ownerLink, false);
    assert.equal(closed.auth.supabaseUser, false);
    assert.equal(closed.auth.linkError, undefined);
    assert.equal(state.calls.slice(offCalls).some((call) => call.path.endsWith('/app_oauth_tokens')), false);

    const snake = encryptToken({
      refresh_token: SNAKE_REFRESH,
      access_token: userJwt(OWNER),
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: OWNER },
      revoked: false,
    }, env);
    assert.equal(snake.ok, true);
    row.ciphertext = snake.ciphertext;
    const snakeRead = await fresh(port, env, 'jrl');
    assert.equal(snakeRead.supabaseUser, true);
    assert.equal(snakeRead.subject, OWNER);
    assert.equal(snakeRead.connected, true);
    assert.ok(snakeRead.fieldNames.includes('refresh_token'));
    assert.ok(snakeRead.fieldNames.includes('user'));
    assert.equal(snakeRead.leaked, false);
    assert.equal(row.ciphertext, snake.ciphertext);
    assert.equal(Number(row.generation), 1);
    row.ciphertext = sealed;

    const put = await potPut(new Request('http://localhost/api/cockpit/jrl/pots', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        targets: { lifestyle: 10001, short_term: 10000, emergency: 10000, investments: 10000 },
        manual: {},
      }),
    }), { env });
    assert.equal(put.status, 200);
    const written = await put.json();
    assert.equal(written.record.targets.lifestyle, 10001);
    const storedPot = state.tables.jrl_pot_preferences[0];
    assert.equal(storedPot.document.targets.lifestyle, 10001);
    assert.deepEqual(storedPot.document.manual, {});
    assert.equal(state.calls.some((call) => call.search.includes('id=eq.true')), false);

    const parentPots = await potGet(new Request('http://localhost/api/cockpit/jrl/pots', { headers }), { env });
    const parentBody = await parentPots.json();
    assert.equal(parentBody.stored, true);
    assert.equal(parentBody.record.targets.lifestyle, 10001);
    const childPots = await fresh(port, env, 'pots');
    assert.equal(childPots.stored, true);
    assert.equal(childPots.lifestyle, 10001);
    assert.deepEqual(childPots.manual, {});

    state.potEnvelope = 'object';
    const objectPots = await potGet(new Request('http://localhost/api/cockpit/jrl/pots', { headers }), { env });
    const objectBody = await objectPots.json();
    assert.equal(objectBody.record.targets.lifestyle, 10001);
    state.potEnvelope = 'array';

    const restore = await potPut(new Request('http://localhost/api/cockpit/jrl/pots', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        targets: { lifestyle: 10000, short_term: 10000, emergency: 10000, investments: 10000 },
        manual: {},
      }),
    }), { env });
    assert.equal(restore.status, 200);
    const restored = await fresh(port, env, 'pots');
    assert.equal(restored.lifestyle, 10000);
    assert.equal(restored.shortTerm, 10000);
    assert.equal(restored.emergency, 10000);
    assert.equal(restored.investments, 10000);
    assert.deepEqual(restored.manual, {});
    assert.equal(state.tables.jrl_pot_preferences[0].document.targets.lifestyle, 10000);
    assert.equal(state.calls.some((call) => call.search.includes('id=eq.true')), false);
    assert.equal(state.calls.filter((call) => call.path.includes('monthly_finance') && call.method !== 'GET').length, 0);
    const anonymous = await jrlGet(new Request('http://localhost/api/cockpit/jrl'), { env, now: Date.now() });
    assert.equal(anonymous.status, 401);
    const anonymousBody = await anonymous.json();
    assert.equal(anonymousBody.link, undefined);
    assert.equal(anonymousBody.auth, undefined);
    assert.equal(JSON.stringify(anonymousBody).includes(REFRESH), false);
  } finally {
    global.fetch = previous;
    await new Promise((resolve) => server.close(resolve));
  }
});
