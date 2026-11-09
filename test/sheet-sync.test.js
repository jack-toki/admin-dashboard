const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { decideSheetWrite, findForecastInput, isInputCell } = require('../lib/forecast/sheetSync');
const { applyLiveRead, readForecastSheet, refreshStoredBaseline } = require('../lib/forecast/liveSheet');
const { sourceHash } = require('../lib/forecast/import');
const { forecastBaselineRow } = require('../lib/store');
const { pushForecastValue } = require('../lib/forecast/pushSheet');
const { deriveAutoTasks } = require('../lib/planning/autoTasks');
const { minutesForZap, moneySaved, savingsFromZaps } = require('../lib/automations/savings');

test('a sheet write waits when the cell changed, and formulas are left alone', () => {
  assert.deepEqual(decideSheetWrite({ current: '15', lastSynced: '10', stored: '10', next: '12' }).action, 'conflict');
  assert.equal(decideSheetWrite({ current: '10', lastSynced: '10', stored: '10', next: '12' }).action, 'write');
  assert.equal(decideSheetWrite({ current: '=A1+B1', lastSynced: '10', stored: '10', next: '12' }).reason, 'formula');
  assert.equal(decideSheetWrite({ current: '£9.00', lastSynced: '9', stored: '9', next: '12' }).action, 'write');
  assert.equal(decideSheetWrite({ current: '£2,180.40', lastSynced: '2180.4', stored: '2180.4', next: '3000' }).action, 'write');
  assert.equal(decideSheetWrite({ current: '£15.00', lastSynced: '9', stored: '9', next: '12' }).action, 'conflict');
  assert.equal(decideSheetWrite({ current: 'Northwind', lastSynced: 'Louise', stored: 'Louise', next: 'Harbour' }).action, 'conflict');
  assert.equal(decideSheetWrite({ current: 'Louise', lastSynced: 'Louise', stored: 'Louise', next: 'Harbour' }).action, 'write');
  assert.equal(isInputCell({ label: 'Gross Profit', kind: 'metric', sourceCell: 'B5' }), false);
  assert.equal(isInputCell({ label: 'Retained Clients', kind: 'revenue', sourceCell: 'B3' }), true);
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/cockpit_sheet_sync.sql'), 'utf8');
  assert.match(sql, /create table cockpit.sheet_write_log/);
  assert.match(sql, /create table cockpit.automation_rates/);
  assert.equal(/alter table cockpit.income_detail_lines/i.test(sql), false);
  assert.equal(/grant delete/i.test(sql), false);
});

test('a private sheet read refreshes the cache and leaves a published link alone', async () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const env = {
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: 'writer@example.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }),
    FORECAST_SPREADSHEET_ID: '10sGcVQcgKCJfuy7BDLV_UzxIly-vF4aU5tRjmZumGLk',
    FORECAST_SHEET_CSV_URL: 'https://example.invalid/published.csv',
  };
  const values = [
    ['', 'January 2026'],
    ['Billing', ''],
    ['Retained Clients', 9],
    ['Gross Profit', 9],
  ];
  const formulas = [
    ['', 'January 2026'],
    ['Billing', ''],
    ['Retained Clients', 9],
    ['Gross Profit', '=B3'],
  ];
  const urls = [];
  const live = await readForecastSheet(env, async (url) => {
    urls.push(String(url));
    if (String(url).includes('oauth2.googleapis.com')) return { ok: true, json: async () => ({ access_token: 'token' }) };
    if (String(url).includes('FORMULA')) return { ok: true, json: async () => ({ values: formulas }) };
    return { ok: true, json: async () => ({ values }) };
  });
  assert.equal(urls.some((url) => url.includes('example.invalid')), false);
  assert.equal(live.ok, true);
  const retained = live.cells.find((cell) => cell.label === 'Retained Clients' && cell.month === '2026-01');
  assert.equal(retained.enteredMinor, 900);
  assert.equal(retained.formula, undefined);
  const gross = live.cells.find((cell) => cell.label === 'Gross Profit' && cell.month === '2026-01');
  assert.equal(gross.formula, true);
  assert.equal(isInputCell(gross), false);
  assert.equal(retained.sourceCell, 'B3');
  let saved = null;
  const storedOne = [{
    id: 'baseline:10sGcVQcgKCJfuy7BDLV_UzxIly-vF4aU5tRjmZumGLk:1455407915:B3:2026-01-01',
    label: 'Retained Clients',
    sourceCell: 'B3',
    period: '2026-01-01',
    enteredMinor: 100,
    amountMinor: 100,
    snapshotHash: 'hash',
  }];
  const applied = await applyLiveRead({
    stored: storedOne,
    live,
    save: async (cells) => { saved = cells; },
  });
  assert.equal(applied.sheetRuntime, true);
  assert.equal(applied.sheetFallback, false);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, storedOne[0].id);
  assert.equal(saved[0].enteredMinor, 900);
  assert.equal(saved.some((cell) => cell.label === 'Gross Profit'), false);
  const fallback = await applyLiveRead({
    stored: [{ label: 'Retained Clients', period: '2026-01-01', enteredMinor: 100 }],
    live: { ok: false, cells: [] },
  });
  assert.equal(fallback.sheetRuntime, false);
  assert.equal(fallback.sheetFallback, true);
  assert.equal(fallback.cells[0].enteredMinor, 100);
});

test('a live read updates the 377 stored rows in place and does not double November', async () => {
  const periods = [];
  for (let month = 1; month <= 12; month += 1) periods.push(`2026-${String(month).padStart(2, '0')}-01`);
  periods.push('2027-01-01');
  const labels = [
    ['Retained Clients', 'revenue', 3],
    ['Project Work', 'revenue', 4],
  ];
  for (let row = 5; row <= 31; row += 1) labels.push([`Cost ${row}`, 'cost', row]);
  assert.equal(labels.length * periods.length, 377);
  const column = (period) => {
    const month = Number(period.slice(5, 7));
    const year = Number(period.slice(0, 4));
    const index = year === 2027 ? 13 : month;
    let n = index + 1;
    let letters = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      letters = String.fromCharCode(65 + rem) + letters;
      n = Math.floor((n - 1) / 26);
    }
    return letters;
  };
  const stored = [];
  for (const [label, kind, row] of labels) {
    for (const period of periods) {
      const sourceCell = `${column(period)}${row}`;
      stored.push({
        id: `baseline:sheet:1455407915:${sourceCell}:${period}`,
        label,
        kind,
        rowNumber: row,
        sourceCell,
        period,
        enteredMinor: 0,
        amountMinor: 0,
        cellState: 'zero',
        nullState: 'zero',
        snapshotHash: 'stored-hash',
      });
    }
  }
  const live = [
    { label: 'Retained Clients', kind: 'revenue', sourceCell: `${column('2026-11-01')}3`, month: '2026-11', period: '2026-11-01', enteredMinor: 890000, amountMinor: 890000, id: 'wrong:3:2026-11' },
    { label: 'Project Work', kind: 'revenue', sourceCell: `${column('2026-11-01')}4`, month: '2026-11', period: '2026-11-01', enteredMinor: 540000, amountMinor: 540000, id: 'wrong:4:2026-11' },
    { label: 'Cost 5', kind: 'cost', sourceCell: `${column('2026-11-01')}5`, month: '2026-11', period: '2026-11-01', enteredMinor: 218040, amountMinor: 218040, id: 'wrong:5:2026-11' },
    { label: 'Gross Profit', kind: 'metric', formula: true, sourceCell: 'B40', month: '2026-11', period: '2026-11-01', enteredMinor: 1430000, id: 'formula-row' },
    { label: '', kind: 'cost', sourceCell: 'B41', month: '2026-11', period: '2026-11-01', enteredMinor: 100, id: 'blank-label' },
    { label: '2027', kind: 'cost', sourceCell: 'B42', month: '2026-11', period: '2026-11-01', enteredMinor: 100, id: 'year-row' },
  ];
  let cache = null;
  let recorded = null;
  const first = await applyLiveRead({
    stored,
    live: { ok: true, cells: live },
    save: async (cells) => { cache = cells; },
    recordRead: async (row) => { recorded = row; },
  });
  const november = (cells, kind) => cells.filter((cell) => String(cell.period).startsWith('2026-11') && cell.kind === kind).reduce((sum, cell) => sum + (cell.enteredMinor || 0), 0);
  assert.equal(first.cells.length, 377);
  assert.equal(cache.length, 377);
  assert.equal(new Set(cache.map((cell) => cell.id)).size, 377);
  assert.equal(cache.some((cell) => cell.id === 'formula-row' || cell.id === 'blank-label' || cell.id === 'year-row'), false);
  assert.equal(november(cache, 'revenue'), 1430000);
  assert.equal(november(cache, 'cost'), 218040);
  assert.equal(recorded.cellKey, 'forecast-live-read');
  assert.equal(recorded.sourceCell, 'service_account');
  assert.equal(recorded.lastValue, '377');
  assert.match(recorded.readAt, /^20/);
  const fallback = await applyLiveRead({ stored: cache, live: { ok: false, cells: live } });
  assert.equal(fallback.sheetFallback, true);
  assert.equal(fallback.cells.length, 377);
  assert.equal(november(fallback.cells, 'revenue'), 1430000);
  assert.equal(november(fallback.cells, 'cost'), 218040);
});

test('a live read keeps entered text and includes Jack Salary and Target', async () => {
  const periods = [];
  for (let month = 1; month <= 13; month += 1) periods.push(month === 13 ? '2027-01-01' : `2026-${String(month).padStart(2, '0')}-01`);
  const rows = [
    ['Jack Salary', 37],
    ['Target', 47],
  ];
  const stored = [];
  for (const [label, rowNumber] of rows) {
    for (const period of periods) {
      stored.push({
        id: `baseline:sheet:1455407915:B${rowNumber}:${period}`,
        label,
        kind: 'metric',
        rowNumber,
        sheetId: 1455407915,
        spreadsheetId: 'sheet',
        sourceCell: `B${rowNumber}`,
        period,
        enteredMinor: 100,
        amountMinor: 100,
        cellState: 'value',
        nullState: 'amount',
        userEntered: { numberValue: 1 },
        displayed: '£1.00',
        sourceHash: 'old-hash',
      });
    }
  }
  assert.equal(stored.length, 26);
  const live = stored.map((cell) => ({
    ...cell,
    enteredMinor: cell.label === 'Jack Salary' ? 300000 : 500000,
    formula: true,
    id: `wrong:${cell.rowNumber}:${cell.period}`,
  }));
  const next = refreshStoredBaseline(stored, live);
  assert.equal(next.length, 26);
  assert.equal(next.every((cell) => cell.userEntered.numberValue === 1 && cell.displayed === '£1.00'), true);
  assert.equal(next.filter((cell) => cell.label === 'Jack Salary').every((cell) => cell.enteredMinor === 300000), true);
  assert.equal(next.filter((cell) => cell.label === 'Target').every((cell) => cell.enteredMinor === 500000), true);
  const changed = next[0];
  assert.notEqual(changed.sourceHash, 'old-hash');
  assert.equal(changed.sourceHash, sourceHash({
    workbookRef: 'sheet',
    tabRef: 'Forecast Profit & Loss#1455407915',
    cellRef: `R37C1`,
    period: changed.period,
    label: changed.label,
    nullState: changed.nullState,
    enteredMinor: changed.enteredMinor,
  }));
  const written = forecastBaselineRow(changed, 'hash');
  assert.deepEqual(written.user_entered, { numberValue: 1 });
  assert.equal(written.displayed, '£1.00');
  const untouched = forecastBaselineRow({ ...changed, userEntered: undefined, displayed: undefined }, 'hash');
  assert.equal(Object.hasOwn(untouched, 'user_entered'), false);
  assert.equal(Object.hasOwn(untouched, 'displayed'), false);
  const recorded = await applyLiveRead({
    stored,
    live: { ok: true, cells: live },
    save: async () => {},
    recordRead: async () => { throw new Error('sync state down'); },
  });
  assert.equal(recorded.sheetRuntime, true);
  assert.equal(recorded.cells.length, 26);
});

test('an automatic task hides for this period and returns next period', () => {
  const open = deriveAutoTasks({ period: '2026-11', entries: [{ period: '2026-10' }], posts: 0, cells: [] });
  assert.equal(open.some((task) => task.taskKey === 'automations-silent'), true);
  assert.equal(open.some((task) => task.taskKey === 'jrl-month'), false);
  const hidden = deriveAutoTasks({
    period: '2026-11',
    posts: 0,
    dismissals: [{ id: 'automations-silent:2026-11' }],
  });
  assert.equal(hidden.some((task) => task.taskKey === 'automations-silent'), false);
  const next = deriveAutoTasks({ period: '2026-12', posts: 0, dismissals: [{ id: 'automations-silent:2026-11' }] });
  assert.equal(next.some((task) => task.id === 'automations-silent:2026-12'), true);
});

test('a stored baseline cell is matched on period, not a missing month field', async () => {
  const stored = {
    id: 'baseline:10sGcVQcgKCJfuy7BDLV_UzxIly-vF4aU5tRjmZumGLk:1455407915:3:2026-06',
    spreadsheetId: '10sGcVQcgKCJfuy7BDLV_UzxIly-vF4aU5tRjmZumGLk',
    sheetId: 1455407915,
    rowNumber: 3,
    label: 'Retained Clients',
    groupId: null,
    period: '2026-06-01',
    cellState: 'value',
    nullState: 'amount',
    amountMinor: 10000,
    enteredMinor: 10000,
    effectiveMinor: 10000,
    sourceCell: 'G3',
    source_cell: 'G3',
    currency: 'GBP',
    provenance: 'forecast_baseline',
    isActual: false,
  };
  assert.equal(stored.month, undefined);
  assert.equal(findForecastInput([stored], { label: 'Retained Clients', month: '2026-06' }).sourceCell, 'G3');
  assert.equal(findForecastInput([{ ...stored, period: '2026-06-01T00:00:00.000Z', month: '2026-01' }], { label: 'Retained Clients', month: '2026-06' }).sourceCell, 'G3');
  assert.equal(findForecastInput([{ ...stored, period: undefined, month: '2026-06' }], { label: 'Retained Clients', month: '2026-06' }).sourceCell, 'G3');
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const env = {
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: 'writer@example.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }),
    FORECAST_SPREADSHEET_ID: '10sGcVQcgKCJfuy7BDLV_UzxIly-vF4aU5tRjmZumGLk',
  };
  const result = await pushForecastValue({
    store: {
      listBaseline: async () => [stored],
      readSyncState: async () => ({ lastValue: '100' }),
      appendSheetLog: async () => {},
      saveSyncState: async () => {},
    },
    env,
    label: 'Retained Clients',
    month: '2026-06',
    minor: 12000,
    fetchImpl: async (url, options = {}) => {
      if (String(url).includes('oauth2.googleapis.com')) return { ok: true, json: async () => ({ access_token: 'token' }) };
      if (options.method === 'PUT') return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ values: [['100']] }) };
    },
  });
  assert.equal(result.status, 'written');
  assert.equal(result.cell, 'G3');
});

test('a blank line that is usually empty is not an outstanding forecast gap', () => {
  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((id) => `2026-${id}`);
  const line = (label, filled) => months.map((month) => ({
    label,
    kind: 'cost',
    month,
    nullState: filled.includes(month) ? 'amount' : 'blank',
    enteredMinor: filled.includes(month) ? 100 : null,
  }));
  const usual = deriveAutoTasks({
    period: '2026-11',
    cells: [
      ...line('Freelancers', []),
      ...line('HMRC', []),
      ...line('Pension', []),
      ...line('Zapier', months.filter((month) => month !== '2026-11')),
    ],
  });
  assert.equal(usual.some((task) => task.taskKey === 'sheet-gaps'), true);
  assert.match(usual.find((task) => task.taskKey === 'sheet-gaps').title, /^1 forecast input missing/);
  const quiet = deriveAutoTasks({
    period: '2026-11',
    cells: [...line('Freelancers', []), ...line('HMRC', ['2026-01']), ...line('Pension', months.slice(0, 4))],
  });
  assert.equal(quiet.some((task) => task.taskKey === 'sheet-gaps'), false);
  const required = deriveAutoTasks({
    period: '2026-11',
    cells: [{ label: 'Retained Clients', kind: 'revenue', period: '2026-11-01', nullState: 'blank', enteredMinor: null }],
  });
  assert.equal(required.some((task) => task.taskKey === 'sheet-gaps'), true);
});

test('two rows with the same label are judged separately', () => {
  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((id) => `2026-${id}`);
  const row = (rowNumber, filled) => months.map((month) => ({
    label: 'Accountants',
    kind: 'cost',
    rowNumber,
    month,
    nullState: filled.includes(month) ? 'amount' : 'blank',
    enteredMinor: filled.includes(month) ? 100 : null,
  }));
  const falsePositive = deriveAutoTasks({
    period: '2026-11',
    cells: [...row(21, months), ...row(30, [])],
  });
  assert.equal(falsePositive.some((task) => task.taskKey === 'sheet-gaps'), false);
  const realGap = deriveAutoTasks({
    period: '2026-11',
    cells: [...row(21, months.filter((month) => month !== '2026-11')), ...row(30, [])],
  });
  assert.match(realGap.find((task) => task.taskKey === 'sheet-gaps').title, /^1 forecast input missing/);
});

test('savings use a saved rate or the documented default', () => {
  assert.equal(minutesForZap('Send invoice', null).minutes, 6);
  assert.match(minutesForZap('Send invoice', null).formula, /6 minutes/);
  assert.equal(minutesForZap('Misc', 9).minutes, 9);
  const saved = moneySaved({ runs: 10, minutes: 6, hourlyRate: 50 });
  assert.equal(saved.pounds, 50);
  assert.match(saved.formula, /10 runs × 6 min/);
  const zaps = [
    { zapId: 'invoice', title: 'Send invoice', account: 'Northwind', runs: 10 },
    { zapId: 'email', title: 'Send email', account: 'Northwind', runs: 10 },
  ];
  const rates = [
    { id: 'zap:invoice', minutesPerRun: 9 },
    { id: 'client:Northwind', hourlyRateMinor: 6000 },
  ];
  const totals = savingsFromZaps(zaps, rates);
  assert.equal(totals.pounds, 130);
  assert.equal(moneySaved({ runs: 20, minutes: 7, hourlyRate: 50 }).pounds, 117);
});
