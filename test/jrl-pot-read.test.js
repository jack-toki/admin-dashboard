const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { potDocument } = require('../lib/store/sharedRows');
const { potGet } = require('../lib/cockpit/http');
const { normalisePotRecord } = require('../lib/jrl/pots');
const { signSession, cookieName } = require('../lib/auth');

const REF = 'hcjybjpimqzsueyslxvl';

function serviceKey() {
  const body = Buffer.from(JSON.stringify({ role: 'service_role', ref: REF, nonce: 'pot-read' })).toString('base64url');
  return `e30.${body}.sig`;
}

function storedDocument(lifestyle = 10001) {
  return {
    version: 1,
    targets: { lifestyle, short_term: 10000, emergency: 10000, investments: 10000 },
    manual: {},
    usePortfolioValue: false,
  };
}

function postgrestRow(document) {
  return {
    id: true,
    version: 1,
    document,
    updated_at: '2026-11-09T03:10:00.000Z',
  };
}

test('the stored PostgREST pot row is the document the GET returns', () => {
  const row = postgrestRow(storedDocument(10001));
  const shapes = [
    [row],
    row,
    postgrestRow(JSON.stringify(storedDocument('10001'))),
    { document: postgrestRow(storedDocument(10001)) },
  ];
  for (const shape of shapes) {
    const saved = potDocument(shape);
    const normalised = normalisePotRecord(saved);
    assert.equal(normalised.ok, true);
    assert.equal(normalised.record.targets.lifestyle, 10001);
    assert.equal(normalised.record.targets.short_term, 10000);
    assert.deepEqual(normalised.record.manual, {});
  }
});

test('a cached empty pot GET cannot hide the row PostgREST returns after PUT', async () => {
  const state = { mode: 'empty' };
  const seen = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const profile = req.headers['accept-profile'] || req.headers['content-profile'] || '';
    if (profile !== 'cockpit') {
      res.writeHead(406, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code: 'PGRST106', message: 'schema not exposed' }));
      return;
    }
    let payload;
    if (state.mode === 'empty') payload = [];
    else if (state.mode === 'string') payload = [postgrestRow(JSON.stringify(storedDocument(10001)))];
    else if (state.mode === 'object') payload = postgrestRow(storedDocument(10001));
    else payload = [postgrestRow(storedDocument(10001))];
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const cache = new Map();
  const previous = global.fetch;
  global.fetch = async (input, init = {}) => {
    const raw = typeof input === 'string' ? input : input.url;
    const target = new URL(raw);
    const host = target.host;
    target.protocol = 'http:';
    target.hostname = '127.0.0.1';
    target.port = String(port);
    const headers = new Headers(init.headers || {});
    headers.set('x-upstream-host', host);
    const method = init.method || 'GET';
    const key = `${method} ${target.pathname}${target.search}`;
    seen.push({
      method,
      search: target.search,
      profile: headers.get('accept-profile') || headers.get('content-profile') || '',
      cache: init.cache || null,
    });
    if (method === 'GET' && init.cache !== 'no-store' && cache.has(key)) {
      const hit = cache.get(key);
      return new Response(hit, { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const response = await previous(target, { ...init, headers });
    const text = await response.text();
    if (method === 'GET' && init.cache !== 'no-store') cache.set(key, text);
    return new Response(text, { status: response.status, headers: { 'content-type': 'application/json' } });
  };
  const env = {
    APP_STORE: 'supabase',
    SUPABASE_URL: `https://${REF}.supabase.co`,
    SUPABASE_SERVICE_KEY: serviceKey(),
    COCKPIT_DB_SCHEMA: 'cockpit',
    APP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 12).toString('base64'),
    DASHBOARD_SESSION_SECRET: 'session-secret-for-pot-read',
    NODE_ENV: 'test',
  };
  const cockpit = signSession({ role: 'admin', areas: ['jrl'] }, env);
  const headers = { cookie: `${cookieName()}=${cockpit}` };
  const read = () => potGet(new Request('http://localhost/api/cockpit/jrl/pots', { headers }), { env });
  try {
    const before = await (await read()).json();
    assert.equal(before.stored, true);
    assert.equal(before.record.targets.lifestyle, 10000);
    state.mode = 'row';
    const after = await (await read()).json();
    assert.equal(after.stored, true);
    assert.equal(after.record.targets.lifestyle, 10001);
    assert.equal(after.record.targets.emergency, 10000);
    assert.deepEqual(after.record.manual, {});
    state.mode = 'string';
    const asText = await (await read()).json();
    assert.equal(asText.record.targets.lifestyle, 10001);
    state.mode = 'object';
    const asObject = await (await read()).json();
    assert.equal(asObject.record.targets.lifestyle, 10001);
    const gets = seen.filter((call) => call.method === 'GET');
    assert.ok(gets.length >= 2);
    for (const call of gets) {
      assert.equal(call.cache, 'no-store');
      assert.equal(call.profile, 'cockpit');
      assert.match(call.search, /select=\*/);
      assert.equal(call.search.includes('id=eq.true'), false);
    }
  } finally {
    global.fetch = previous;
    await new Promise((resolve) => server.close(resolve));
  }
});
