const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { importBaseline } = require('../lib/forecast/import');
const { DELETION_AUDIT, modelFromStoredCells, readStoredForecast } = require('../lib/forecast/model');
const { overview, withScenario } = require('../lib/finance/screen');
const { openAppStore } = require('../lib/store/index');
const { cockpitWorkspace } = require('../lib/workspace/cockpit');

const grid = [
  ['', 'January', 'February'],
  ['Billing'],
  ['Retained Clients', '10', '0'],
  ['Project Work', '4', ''],
  ['Costs'],
  ['Cursor', '5', ''],
];

function sheetEnvOff() {
  const names = ['SHEET_CSV_URL', 'FORECAST_SPREADSHEET_ID', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI', 'GOOGLE_SERVICE_ACCOUNT_JSON'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  return () => {
    for (const [name, value] of Object.entries(previous)) {
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

test('stored forecast reads, writes, and recomputes with sheet networking disabled', async () => {
  const restore = sheetEnvOff();
  const originalFetch = global.fetch;
  let fetches = 0;
  global.fetch = async () => {
    fetches += 1;
    throw new Error('network_disabled');
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'toki-deletion-'));
  const env = {
    APP_STORE: 'file',
    APP_STORE_PATH: path.join(directory, 'store.enc'),
    APP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    NODE_ENV: 'test',
  };
  try {
    const imported = importBaseline([{ title: 'Forecast Profit & Loss', sheetId: 1455407915, grid }], { spreadsheetId: 'example-workbook' });
    const opened = openAppStore(env);
    const saved = await opened.store.saveBaseline(imported.cells);
    const plan = await opened.store.savePlan({
      id: 'plan-example',
      kind: 'cost',
      amountMinor: 250,
      currency: 'GBP',
      month: '2026-01',
      party: 'Example vendor',
      groupId: 'administration',
      timing: 'one_off',
      attestation: 'forecast',
    });
    const again = openAppStore(env);
    const stored = await readStoredForecast(again.store);
    assert.equal(stored.sheetRuntime, false);
    assert.equal(stored.sheetFallback, false);
    assert.equal(stored.workbookRequiredAtRuntime, false);
    assert.equal(stored.model.source, 'stored_forecast');
    assert.equal(stored.model.provenance.workbookId, 'example-workbook');
    const january = stored.model.rows.find((row) => row.label === 'Retained Clients').cells['2026-01'];
    assert.equal(january.minor, 1000);
    assert.equal(stored.recomputed.revenueMinor, 1400);
    const higher = overview({ rows: withScenario(stored.model.rows, 'best') }, null, '2026-01');
    assert.equal(higher.revenueMinor, 1540);
    assert.equal(fetches, 0);
    const reloaded = await again.store.listPlans();
    assert.equal(reloaded.find((entry) => entry.id === plan.id).amountMinor, 250);
    assert.equal(saved.created > 0, true);
    const cursor = stored.model.rows.find((row) => row.label === 'Cursor');
    assert.equal(cursor.group.sourceConfirmed, false);
    assert.equal(cursor.group.groupId, null);

    let sheetCalls = 0;
    await assert.rejects(() => readStoredForecast({
      async listBaseline() {
        sheetCalls += 1;
        throw new Error('store_failed');
      },
    }), /store_failed/);
    assert.equal(sheetCalls, 1);
    assert.equal(fetches, 0);

    const workspace = cockpitWorkspace(env, { role: 'admin', areas: ['toki'] });
    assert.equal(workspace.sheets.sourceOfTruth, false);
    assert.equal(workspace.sheets.runtimeFetch, false);
    assert.equal(DELETION_AUDIT.allGoogleSheetsSafeToDelete, false);
    assert.equal(DELETION_AUDIT.forecastWorkbook.cockpitNeedsWorkbookToOperate, false);
    assert.equal(DELETION_AUDIT.forecastWorkbook.safeToDelete, false);
    assert.equal(DELETION_AUDIT.forecastWorkbook.notMigrated.length >= 4, true);
    assert.equal(DELETION_AUDIT.profilesWorkbook.publicDashboardRuntimeSource, true);
    assert.equal(DELETION_AUDIT.profilesWorkbook.changedInThisWork, false);
    const forecastRoute = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'cockpit', 'forecast', 'route.js'), 'utf8');
    const dashboardRoute = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'dashboard', 'route.js'), 'utf8');
    assert.equal(forecastRoute.includes('SHEET_CSV_URL'), false);
    assert.equal(forecastRoute.includes('googleapis'), false);
    assert.equal(dashboardRoute.includes('SHEET_CSV_URL'), true);
    const blank = modelFromStoredCells([{ label: 'Retained Clients', rowNumber: 3, period: '2026-01-01', groupId: 'billing', cellState: 'blank', amountMinor: null }]);
    assert.equal(blank.rows[0].cells['2026-01'].blank, true);
    assert.equal(blank.rows[0].cells['2026-01'].minor, null);
  } finally {
    global.fetch = originalFetch;
    restore();
  }
});
