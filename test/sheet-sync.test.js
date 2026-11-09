const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { decideSheetWrite, findForecastInput, isInputCell } = require('../lib/forecast/sheetSync');
const { pushForecastValue } = require('../lib/forecast/pushSheet');
const { deriveAutoTasks } = require('../lib/planning/autoTasks');
const { minutesForZap, moneySaved, savingsFromZaps } = require('../lib/automations/savings');

test('a sheet write waits when the cell changed, and formulas are left alone', () => {
  assert.deepEqual(decideSheetWrite({ current: '15', lastSynced: '10', stored: '10', next: '12' }).action, 'conflict');
  assert.equal(decideSheetWrite({ current: '10', lastSynced: '10', stored: '10', next: '12' }).action, 'write');
  assert.equal(decideSheetWrite({ current: '=A1+B1', lastSynced: '10', stored: '10', next: '12' }).reason, 'formula');
  assert.equal(isInputCell({ label: 'Gross Profit', kind: 'metric', sourceCell: 'B5' }), false);
  assert.equal(isInputCell({ label: 'Retained Clients', kind: 'revenue', sourceCell: 'B3' }), true);
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/cockpit_sheet_sync.sql'), 'utf8');
  assert.match(sql, /create table cockpit.sheet_write_log/);
  assert.match(sql, /create table cockpit.automation_rates/);
  assert.equal(/alter table cockpit.income_detail_lines/i.test(sql), false);
  assert.equal(/grant delete/i.test(sql), false);
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
