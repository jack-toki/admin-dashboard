const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { importBaseline, importNormalized, upsertBaseline, summarizeSnapshot, snapshotMatchesExpected, EXPECTED_SNAPSHOT_SHAPE } = require('../lib/forecast/import');
const { readTheme, writeTheme } = require('../lib/theme');
const { openAppStore } = require('../lib/store/index');
const { targetCheck, EXPECTED_PROJECT_REF, EXPECTED_SNAPSHOT_HASH, COCKPIT_ACCESS, classifySchemaProbe, probeCockpitSchema } = require('../lib/store/target');
const { POST, GET } = require('../app/api/cockpit/forecast/route');
const { GET: targetGET } = require('../app/api/cockpit/target/route');
const { signSession, cookieName } = require('../lib/auth');

function serviceJwt(ref, role = 'service_role') {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ role, ref })).toString('base64url');
  return `${header}.${body}.not-a-signature`;
}

const grid = [
  ['', 'January', 'February'],
  ['Billing'],
  ['Retained Clients', '10', '0'],
  ['Project Work', '4', ''],
  ['Gross Profit', '14', '0'],
  ['Costs'],
  ['Example Tool', '1', '1'],
  ['Cursor', '5', ''],
  ['Monthly Cost', '1', '1'],
];

test('supabase forecast reads stay closed until the project ref and schema flag match', async () => {
  const other = 'aaaaaaaaaaaaaaaaaaaa';
  const key = serviceJwt(other);
  const opened = openAppStore({
    APP_STORE: 'supabase',
    SUPABASE_URL: `https://${other}.supabase.co`,
    SUPABASE_SERVICE_KEY: key,
    APP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    COCKPIT_DB_SCHEMA: 'cockpit',
  });
  assert.equal(opened.ok, true);
  await assert.rejects(() => opened.store.listBaseline(), /target_mismatch/);
  const readyHost = openAppStore({
    APP_STORE: 'supabase',
    SUPABASE_URL: `https://${EXPECTED_PROJECT_REF}.supabase.co`,
    SUPABASE_SERVICE_KEY: serviceJwt(EXPECTED_PROJECT_REF),
    APP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  });
  await assert.rejects(() => readyHost.store.listBaseline(), /schema_unconfirmed/);
  const report = targetCheck({
    SUPABASE_URL: `https://${EXPECTED_PROJECT_REF}.supabase.co`,
    SUPABASE_SERVICE_KEY: serviceJwt(EXPECTED_PROJECT_REF),
  });
  assert.equal(report.match, true);
  assert.equal(report.reason, 'match');
  assert.equal(report.connected, false);
  assert.equal(report.writesAllowed, false);
  assert.equal(report.importGateOpen, false);
  assert.equal(JSON.stringify(report).includes(serviceJwt(EXPECTED_PROJECT_REF)), false);
  const publishable = targetCheck({
    SUPABASE_URL: `https://${EXPECTED_PROJECT_REF}.supabase.co`,
    SUPABASE_SERVICE_KEY: serviceJwt(EXPECTED_PROJECT_REF, 'anon'),
  });
  assert.equal(publishable.match, false);
  assert.equal(publishable.reason, 'unreadable');
  const flagged = targetCheck({
    SUPABASE_URL: `https://${EXPECTED_PROJECT_REF}.supabase.co/rest/v1`,
    SUPABASE_SERVICE_KEY: serviceJwt(EXPECTED_PROJECT_REF),
    COCKPIT_DB_SCHEMA: 'cockpit',
  });
  assert.equal(flagged.match, false);
  assert.equal(COCKPIT_ACCESS.reachable, false);
  assert.equal(COCKPIT_ACCESS.doNot.includes('ALTER ROLE'), true);
});

test('the cockpit schema probe reports live PostgREST codes and does not leak the key', async () => {
  assert.deepEqual(classifySchemaProbe(406, 'PGRST106'), { schemaExposed: false, reachable: false, code: 'PGRST106' });
  assert.deepEqual(classifySchemaProbe(404, 'PGRST205'), { schemaExposed: true, reachable: false, code: 'PGRST205' });
  assert.deepEqual(classifySchemaProbe(200, null), { schemaExposed: true, reachable: true, code: null });
  const key = serviceJwt(EXPECTED_PROJECT_REF);
  const env = {
    SUPABASE_URL: `https://${EXPECTED_PROJECT_REF}.supabase.co`,
    SUPABASE_SERVICE_KEY: key,
  };
  let calls = 0;
  const opened = await probeCockpitSchema(env, async (url, init) => {
    calls += 1;
    assert.equal(init.headers['Accept-Profile'], 'cockpit');
    assert.equal(url.startsWith(`https://${EXPECTED_PROJECT_REF}.supabase.co/rest/v1/forecast_baseline_cells`), true);
    return { ok: true, status: 200, async json() { return []; } };
  });
  assert.equal(calls, 1);
  assert.equal(opened.reachable, true);
  assert.equal(JSON.stringify(opened).includes(key), false);
  const failed = await probeCockpitSchema(env, async () => { throw new Error(key); });
  assert.equal(failed.code, 'probe_failed');
  assert.equal(failed.reachable, false);
  assert.equal(JSON.stringify(failed).includes(key), false);
  const closed = await probeCockpitSchema(env, async () => ({
    ok: false,
    status: 406,
    async json() { return { code: 'PGRST106', message: key }; },
  }));
  assert.equal(closed.code, 'PGRST106');
  assert.equal(closed.schemaExposed, false);
  assert.equal(JSON.stringify(closed).includes(key), false);
});

test('light is the default until an explicit dark choice is saved', () => {
  const memory = { store: {}, getItem(key) { return this.store[key] || null; }, setItem(key, value) { this.store[key] = value; } };
  assert.equal(readTheme(memory), 'light');
  assert.equal(readTheme({ getItem: () => 'dark' }), 'dark');
  assert.equal(writeTheme(memory, 'dark'), 'dark');
  assert.equal(memory.getItem('jrl-theme'), 'dark');
});

test('the first-tab import keeps blanks unknown and is idempotent', () => {
  const imported = importBaseline([{ title: 'Forecast Profit & Loss', sheetId: 1455407915, grid }], { spreadsheetId: 'example-sheet' });
  assert.equal(imported.ok, true);
  assert.equal(imported.reconciliation.forecastsAreActuals, false);
  assert.equal(imported.reconciliation.actualsImported, 0);
  const januaryProject = imported.cells.find((cell) => cell.label === 'Project Work' && cell.month === '2026-02');
  assert.equal(januaryProject.amountMinor, null);
  const januaryRetained = imported.cells.find((cell) => cell.label === 'Retained Clients' && cell.month === '2026-01');
  assert.equal(januaryRetained.amountMinor, 1000);
  assert.equal(januaryRetained.provenance, 'forecast_baseline');
  assert.equal(januaryRetained.isActual, false);
  assert.equal(januaryRetained.nullState, 'amount');
  assert.equal(januaryRetained.enteredMinor, januaryRetained.effectiveMinor);
  assert.equal(januaryProject.nullState, 'blank');
  assert.equal(imported.formulaFlags[0].month, '2027-01');
  assert.equal(imported.formulaFlags[0].omittedMinor, 3650);
  assert.equal(imported.formulaFlags[0].appliedToStoredCell, false);
  assert.equal(imported.cells.some((cell) => cell.amountMinor === 3650 && cell.month === '2027-01'), false);
  const cursor = imported.cells.find((cell) => cell.label === 'Cursor' && cell.month === '2026-01');
  assert.equal(cursor.groupId, null);
  assert.equal(cursor.suggestedGroupId, 'administration');
  const zero = imported.cells.find((cell) => cell.label === 'Retained Clients' && cell.month === '2026-02');
  assert.equal(zero.nullState, 'zero');
  assert.equal(zero.enteredMinor, 0);
  const againHash = importBaseline([{ title: 'Forecast Profit & Loss', sheetId: 1455407915, grid }], { spreadsheetId: 'example-sheet' });
  assert.equal(againHash.cells[0].sourceHash, imported.cells[0].sourceHash);
  const again = upsertBaseline(imported.cells, imported.cells);
  assert.equal(again.created, 0);
  assert.equal(again.cells.length, imported.cells.length);
  const rejected = importBaseline([{ title: 'Forecast Profit & Loss V2', sheetId: 99, grid }], { spreadsheetId: 'example-sheet' });
  assert.equal(rejected.ok, false);
});

test('the private snapshot shape is 29 rows by 13 periods and the sql default-denies anon', () => {
  const periods = Array.from({ length: 13 }, (_, index) => `2026-${String(index + 1).padStart(2, '0')}-01`);
  const records = [];
  let value = 0;
  let zero = 0;
  let blank = 0;
  let groupNull = 0;
  for (let row = 1; row <= 29; row += 1) {
    for (const period of periods) {
      let cellState = 'value';
      let amount = 1;
      if (blank < 72) {
        cellState = 'blank';
        amount = null;
        blank += 1;
      } else if (zero < 49) {
        cellState = 'zero';
        amount = 0;
        zero += 1;
      } else {
        value += 1;
      }
      const group = groupNull < 39 ? null : 'billing';
      if (group == null) groupNull += 1;
      records.push({
        source_cell: `B${row}`,
        source_row: row,
        period,
        scenario: 'forecast',
        cell_state: cellState,
        value: amount,
        group,
      });
    }
  }
  const summary = summarizeSnapshot(records);
  assert.equal(summary.recordCount, 377);
  assert.equal(snapshotMatchesExpected(summary), true);
  assert.equal(EXPECTED_SNAPSHOT_SHAPE.recordCount, 29 * 13);
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'cockpit_forecast.sql'), 'utf8');
  assert.match(sql, /begin;/);
  assert.match(sql, /create schema if not exists cockpit/);
  assert.match(sql, /revoke all on schema cockpit from anon/);
  assert.match(sql, /grant select, insert, update on all tables in schema cockpit to service_role/);
  assert.equal(/grant .+ to anon/i.test(sql), false);
  assert.equal(/alter table public\.runs/i.test(sql), false);
  assert.equal(/^\s*alter\s+role\b/im.test(sql), false);
  assert.match(sql, /TRUNCATE/);
  const packet = records.map((record) => ({
    ...record,
    label: 'example',
    value: record.cell_state === 'value' ? '1.00' : record.value,
  }));
  const normalized = importNormalized(packet, { spreadsheetId: 'example-sheet', sheetId: 1455407915, fullSnapshot: true });
  assert.equal(normalized.ok, false);
  assert.equal(normalized.error, 'hash_mismatch');
  assert.equal(normalized.cells, undefined);
  assert.equal(EXPECTED_SNAPSHOT_HASH, 'd6ef94188f453fab499cf4740885d2f7086fd6a74b2b3e8021cc8359c70f01a7');
});

test('forecast import requires a signed-in Toki session and does not read a sheet', async () => {
  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = 'session-secret-for-forecast';
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'toki-forecast-'));
  const env = {
    APP_STORE: 'file',
    APP_STORE_PATH: path.join(directory, 'store.enc'),
    APP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString('base64'),
    NODE_ENV: 'test',
    DASHBOARD_SESSION_SECRET: process.env.DASHBOARD_SESSION_SECRET,
  };
  const token = signSession({ role: 'admin', areas: ['toki', 'automations', 'jrl'] }, env);
  const cookie = `${cookieName()}=${token}`;
  try {
    const closed = await GET(new Request('http://localhost/api/cockpit/forecast'));
    assert.equal(closed.status, 401);
    const saved = await POST(new Request('http://localhost/api/cockpit/forecast', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        confirm: 'import-forecast-baseline',
        spreadsheetId: 'example-sheet',
        sheets: [{ title: 'Forecast Profit & Loss', sheetId: 1455407915, grid }],
      }),
    }), { env: undefined });
    assert.equal(saved.status, 503);
    const previousStore = {
      APP_STORE: process.env.APP_STORE,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
      APP_TOKEN_ENCRYPTION_KEY: process.env.APP_TOKEN_ENCRYPTION_KEY,
      COCKPIT_DB_SCHEMA: process.env.COCKPIT_DB_SCHEMA,
    };
    const other = 'bbbbbbbbbbbbbbbbbbbb';
    const otherKey = serviceJwt(other);
    process.env.APP_STORE = 'supabase';
    process.env.SUPABASE_URL = `https://${other}.supabase.co`;
    process.env.SUPABASE_SERVICE_KEY = otherKey;
    process.env.APP_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
    process.env.COCKPIT_DB_SCHEMA = 'cockpit';
    const blocked = await POST(new Request('http://localhost/api/cockpit/forecast', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        confirm: 'import-forecast-baseline',
        spreadsheetId: 'example-sheet',
        sheets: [{ title: 'Forecast Profit & Loss', sheetId: 1455407915, grid }],
      }),
    }));
    const blockedBody = await blocked.json();
    assert.equal(blocked.status, 503);
    assert.equal(blockedBody.error, 'target_mismatch');
    assert.equal(blockedBody.connected, false);
    assert.equal(blockedBody.target.match, false);
    assert.equal(JSON.stringify(blockedBody).includes(other), false);
    assert.equal(JSON.stringify(blockedBody).includes(otherKey), false);
    const status = await targetGET(new Request('http://localhost/api/cockpit/target', { headers: { cookie } }));
    const statusBody = await status.json();
    assert.equal(status.status, 200);
    assert.equal(statusBody.connected, false);
    assert.equal(statusBody.target.expectedRef, EXPECTED_PROJECT_REF);
    assert.equal(statusBody.access.reachable, false);
    assert.equal(statusBody.access.probed, false);
    assert.equal(statusBody.access.probeCode, null);
    assert.equal(JSON.stringify(statusBody).includes(otherKey), false);
    const anonymous = await targetGET(new Request('http://localhost/api/cockpit/target'));
    assert.equal(anonymous.status, 401);
    for (const [name, value] of Object.entries(previousStore)) {
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
    const opened = openAppStore(env);
    const direct = importBaseline([{ title: 'Forecast Profit & Loss', sheetId: 1455407915, grid }], { spreadsheetId: 'example-sheet' });
    const first = await opened.store.saveBaseline(direct.cells);
    const second = await opened.store.saveBaseline(direct.cells);
    assert.equal(first.created, direct.cells.length);
    assert.equal(second.created, 0);
    assert.equal(second.updated, direct.cells.length);
    assert.equal((await opened.store.listBaseline()).every((cell) => cell.isActual === false), true);
  } finally {
    if (previous == null) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous;
  }
});
