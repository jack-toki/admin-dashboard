const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { signSession, cookieName } = require('../lib/auth');
const { incomeDetailPost } = require('../lib/cockpit/http');
const { potGet, potPut } = require('../lib/cockpit/http');
const { openAppStore } = require('../lib/store');
const { openFileStore } = require('../lib/store/fileStore');
const { relationMissing } = require('../lib/store/sharedRows');
const { reconcileKind } = require('../lib/planning/incomeDetail');
const { potViews } = require('../lib/jrl/pots');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REF = 'hcjybjpimqzsueyslxvl';

function serviceKey() {
  const body = Buffer.from(JSON.stringify({ role: 'service_role', ref: REF })).toString('base64url');
  return `e30.${body}.sig`;
}

test('a missing table is not ready and a missing column is a store failure', () => {
  assert.equal(relationMissing({ code: 'PGRST205', message: 'schema cache' }), true);
  assert.equal(relationMissing({ code: '42P01', message: 'relation does not exist' }), true);
  assert.equal(relationMissing({ code: 'PGRST204', message: 'column contract_end_date does not exist' }), false);
  assert.equal(relationMissing(null), false);
});

test('legacy saveToken rejects provider jrl', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'toki-token-'));
  const store = openFileStore(path.join(directory, 'store.enc'), {
    APP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  });
  assert.throws(() => store.saveToken({ provider: 'jrl', tenantKey: 'owner', payload: { refreshToken: 'secret' } }), /jrl_requires_generation/);
});

test('the shared store persists income and pots over the cockpit HTTP contract', async () => {
  const rows = { income_detail_lines: [], jrl_pot_preferences: [], plan_entries: [] };
  let missing = true;
  const seen = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const table = url.pathname.split('/').pop();
    seen.push(`${req.method} ${table}`);
    const profile = req.headers['accept-profile'] || req.headers['content-profile'];
    if (profile !== 'cockpit') {
      res.writeHead(406, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code: 'PGRST106', message: 'schema not exposed' }));
      return;
    }
    if (missing && (table === 'income_detail_lines' || table === 'jrl_pot_preferences')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code: 'PGRST205', message: `Could not find the table cockpit.${table} in the schema cache` }));
      return;
    }
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
      const tableRows = rows[table] || [];
      if (req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(tableRows));
        return;
      }
      if (req.method === 'POST') {
        const incoming = Array.isArray(body) ? body : [body];
        for (const row of incoming) {
          const index = tableRows.findIndex((item) => item.id === row.id);
          if (index >= 0) tableRows[index] = { ...tableRows[index], ...row };
          else tableRows.push({ created_at: '2026-11-08T00:00:00Z', ...row });
        }
        rows[table] = tableRows;
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify(incoming.map((row) => tableRows.find((item) => item.id === row.id))));
        return;
      }
      if (req.method === 'PATCH') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '');
        const index = tableRows.findIndex((item) => item.id === id && item.deleted_at == null);
        if (index >= 0) tableRows[index] = { ...tableRows[index], ...body };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(index >= 0 ? [{ id }] : []));
        return;
      }
      res.writeHead(405, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: 'method' }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const previousFetch = global.fetch;
  global.fetch = (input, init) => {
    const target = new URL(typeof input === 'string' ? input : input.url);
    target.protocol = 'http:';
    target.hostname = '127.0.0.1';
    target.port = String(port);
    return previousFetch(target, init);
  };
  const env = {
    APP_STORE: 'supabase',
    SUPABASE_URL: `https://${REF}.supabase.co`,
    SUPABASE_SERVICE_KEY: serviceKey(),
    COCKPIT_DB_SCHEMA: 'cockpit',
    APP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    DASHBOARD_SESSION_SECRET: 'session-secret-for-shared-store',
    NODE_ENV: 'test',
  };
  try {
    const closed = openAppStore(env);
    assert.equal(closed.ok, true);
    assert.equal(closed.store.shared, true);
    const gap = await closed.store.listIncomeDetails();
    assert.equal(gap.error, 'income_detail_schema_required');
    const potGap = await closed.store.readPotRecord();
    assert.equal(potGap.error, 'pot_store_not_ready');
    missing = false;

    const admin = signSession({ role: 'admin', areas: ['toki', 'jrl'] }, env);
    const cookie = `${cookieName()}=${admin}`;
    const saved = await incomeDetailPost(new Request('http://localhost/api/cockpit/income-detail', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'detail_acme',
        kind: 'retainer',
        party: 'Acme Ltd',
        amount: 1500,
        firstPaymentMonth: '2026-10',
        contractEndDate: '2027-03-31',
        totalPayments: 6,
        sourceRowId: 'sheet:3:retainer',
      }),
    }), { env });
    assert.equal(saved.status, 201);
    const created = await saved.json();
    assert.equal(created.planCount, 0);
    assert.equal(created.record.amountMinor, 150000);
    assert.equal(reconcileKind([created.record], 10000, '2026-11', 'retainer').difference, 140000);
    const edited = await closed.store.saveIncomeDetail({ ...created.record, party: 'Acme Limited' });
    assert.equal(edited.party, 'Acme Limited');
    const removed = await closed.store.deleteIncomeDetail('detail_acme');
    assert.equal(removed.tombstone, true);
    assert.equal(removed.deleted, true);
    const kept = await closed.store.listIncomeDetails();
    assert.equal(kept[0].deletedAt == null, false);
    assert.equal(seen.some((line) => line.startsWith('DELETE ')), false);
    assert.equal(seen.filter((line) => line === 'POST plan_entries').length, 0);

    const jrl = signSession({ role: 'admin', areas: ['jrl'] }, env);
    const jrlCookie = `${cookieName()}=${jrl}`;
    const put = await potPut(new Request('http://localhost/api/cockpit/jrl/pots', {
      method: 'PUT',
      headers: { cookie: jrlCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ manual: { emergency: { amount: 0, asOf: '2026-11-01' } }, targets: { lifestyle: 10000 } }),
    }), { env });
    assert.equal(put.status, 200);
    const read = await potGet(new Request('http://localhost/api/cockpit/jrl/pots', { headers: { cookie: jrlCookie } }), { env });
    const pots = await read.json();
    assert.equal(pots.stored, true);
    const views = potViews(pots.record, []);
    assert.equal(views.find((pot) => pot.id === 'emergency').zero, true);
    assert.equal(views.find((pot) => pot.id === 'emergency').known, true);
    assert.equal(views.find((pot) => pot.id === 'lifestyle').known, false);
    assert.equal(views.find((pot) => pot.id === 'lifestyle').balance, null);
  } finally {
    global.fetch = previousFetch;
    await new Promise((resolve) => server.close(resolve));
  }
});
