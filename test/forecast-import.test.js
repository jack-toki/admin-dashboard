const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { importBaseline, upsertBaseline, summarizeSnapshot, snapshotMatchesExpected, EXPECTED_SNAPSHOT_SHAPE } = require('../lib/forecast/import');
const { readTheme, writeTheme } = require('../lib/theme');
const { openAppStore } = require('../lib/store/index');
const { POST, GET } = require('../app/api/cockpit/forecast/route');
const { signSession, cookieName } = require('../lib/auth');

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

test('supabase forecast reads stay closed until the cockpit schema is confirmed', async () => {
  const opened = openAppStore({
    APP_STORE: 'supabase',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_KEY: 'not-a-live-key',
    APP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  });
  assert.equal(opened.ok, true);
  await assert.rejects(() => opened.store.listBaseline(), /schema_unconfirmed/);
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
  assert.match(sql, /TRUNCATE/);
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
