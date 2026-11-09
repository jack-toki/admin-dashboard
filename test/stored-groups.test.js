const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { modelFromStoredCells } = require('../lib/forecast/model');
const { overview } = require('../lib/finance/screen');
const { workingPlanMinor } = require('../lib/planning/entries');
const { evidenceView, ACCOUNTING_PERIODS } = require('../lib/forecast/additional');
const { openAppStore } = require('../lib/store/index');
const { planPost, planPatch, planDelete, planGet } = require('../lib/cockpit/http');
const { signSession, cookieName } = require('../lib/auth');

function cell(overrides) {
  return {
    spreadsheetId: 'example-workbook',
    sheetId: 1455407915,
    month: '2027-01',
    enteredMinor: 100,
    nullState: 'amount',
    sourceConfirmed: true,
    ...overrides,
  };
}

test('human group labels and revenue rows do not sum every stored line', () => {
  const model = modelFromStoredCells([
    cell({ label: 'Retained Clients', rowNumber: 3, kind: 'revenue', groupId: null, sourceConfirmed: false, month: '2026-08', enteredMinor: 1000 }),
    cell({ label: 'Retained Clients', rowNumber: 3, kind: 'revenue', groupId: null, sourceConfirmed: false, enteredMinor: 1000 }),
    cell({ label: 'Project Work', rowNumber: 4, kind: 'revenue', groupId: null, sourceConfirmed: false, enteredMinor: 400 }),
    cell({ label: 'Example tool', rowNumber: 9, kind: 'cost', groupId: 'Administration Expenses', enteredMinor: 3650 }),
    cell({ label: 'Phone', rowNumber: 12, kind: 'cost', groupId: 'Administration Expenses', enteredMinor: 1000 }),
    cell({ label: 'Monthly Cost', rowNumber: 35, kind: 'metric', groupId: null, sourceConfirmed: false, enteredMinor: 1000 }),
    cell({ label: 'Jack Salary', rowNumber: 37, kind: 'metric', groupId: 'People Costs', enteredMinor: 200 }),
    cell({ label: 'Target', rowNumber: 47, kind: null, groupId: null, sourceConfirmed: false, enteredMinor: 99999 }),
  ]);
  const january = overview(model, null, '2027-01');
  assert.equal(january.revenueMinor, 1400);
  assert.equal(january.groups.find((group) => group.groupId === 'administration').forecast.minor, 4650);
  assert.equal(january.groups.find((group) => group.groupId === 'people').forecast.minor, 200);
  assert.equal(model.rows.find((row) => row.label === 'Monthly Cost').cells['2027-01'].minor, 1000);
  assert.equal(model.rows.find((row) => row.label === 'Target').kind, null);
  assert.equal(model.formulaFlags[0].omittedMinor, 3650);
  assert.equal(model.formulaFlags[0].repair, false);
  assert.equal(model.formulaFlags[0].appliedToStoredCell, false);
  assert.equal(model.recompute.sourceDerivedReplaced, false);
  assert.equal(model.recompute.label, 'recomputed_from_inputs');
  const actuals = evidenceView({
    accountingPeriods: ACCOUNTING_PERIODS,
    accountingLines: [{ period: '2026-08-01', role: 'account', groupId: 'billing', amountMinor: 50 }],
    planning: [{ planKind: 'salary_plan', amountMinor: 5000, sourceRow: 51 }],
  }).actuals;
  const august = overview(model, actuals, '2026-08');
  assert.equal(august.groups.find((group) => group.groupId === 'billing').actual.coverage, 'partial');
  assert.equal(august.groups.find((group) => group.groupId === 'billing').judgement, 'incomplete');
  assert.equal(august.groups.find((group) => group.groupId === 'people').actual.known, false);
  assert.equal(january.costMinor, 4850);
  assert.equal(august.costMinor === 5000, false);
});

test('a labelled manual plan can be written, read, recomputed, and removed', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('network_disabled'); };
  delete process.env.SHEET_CSV_URL;
  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = 'plan-roundtrip-secret';
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'toki-plan-'));
  const env = {
    APP_STORE: 'file',
    APP_STORE_PATH: path.join(directory, 'store.enc'),
    APP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    NODE_ENV: 'test',
    DASHBOARD_SESSION_SECRET: process.env.DASHBOARD_SESSION_SECRET,
  };
  const cookie = `${cookieName()}=${signSession({ role: 'admin', areas: ['toki'] }, env)}`;
  const headers = { cookie, 'content-type': 'application/json' };
  try {
    const created = await planPost(new Request('http://localhost/api/cockpit/plan', {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'cost', amount: 2.5, currency: 'GBP', month: '2026-01', party: 'Example plan check', groupId: 'administration', timing: 'one_off', attestation: 'forecast' }),
    }), { env });
    const createdBody = await created.json();
    assert.equal(created.status, 201);
    const id = createdBody.entry.id;
    const read = await planGet(new Request('http://localhost/api/cockpit/plan', { headers }), { env });
    assert.equal((await read.json()).entries[0].amountMinor, 250);
    assert.equal(workingPlanMinor(1000, (await (await planGet(new Request('http://localhost/api/cockpit/plan', { headers }), { env })).json()).entries, '2026-01', 'administration'), 1250);
    const patched = await planPatch(new Request('http://localhost/api/cockpit/plan', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ id, amount: 1 }),
    }), { env });
    assert.equal((await patched.json()).entry.amountMinor, 100);
    const removed = await planDelete(new Request('http://localhost/api/cockpit/plan', {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ id }),
    }), { env });
    assert.equal((await removed.json()).deleted, true);
    const after = await planGet(new Request('http://localhost/api/cockpit/plan', { headers }), { env });
    assert.equal((await after.json()).entries.length, 0);
    assert.equal(openAppStore(env).store.listBaseline().length, 0);
  } finally {
    global.fetch = originalFetch;
    if (previous == null) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous;
  }
});
