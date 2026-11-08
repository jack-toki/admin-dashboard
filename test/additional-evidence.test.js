const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { validateAdditionalPacket, evidenceView, ACCOUNTING_PERIODS, PRIMARY_BASELINE, ARCHIVE_STAYS_PARENT_SIDE } = require('../lib/forecast/additional');
const { EXPECTED_SNAPSHOT_HASH } = require('../lib/store/target');
const { openAppStore } = require('../lib/store/index');
const { overview } = require('../lib/finance/screen');
const { modelFromStoredCells } = require('../lib/forecast/model');

function line(overrides) {
  return {
    period: '2026-01-01',
    accountLabel: 'Example sales',
    groupId: 'billing',
    sourceWorkbookId: 'example-workbook',
    sourceSheetId: 200,
    sourceCell: 'B2',
    role: 'account',
    amountMinor: 100,
    sourceCellState: 'value',
    coverage: 'complete_export',
    sourceHash: 'example',
    ...overrides,
  };
}

function packet(extra = {}) {
  return {
    counts: {
      accountingLines: 2,
      alternativeCells: 1,
      reconciliation: 1,
      invoices: 1,
      planning: 1,
    },
    accountingPeriods: ACCOUNTING_PERIODS,
    accountingLines: [
      line(),
      line({ period: '2026-08-01', sourceCell: 'B3', amountMinor: 50, coverage: 'partial_export', accountLabel: 'Example admin', groupId: 'administration' }),
    ],
    alternativeCells: [{
      scenarioId: 'v2', label: 'Example alternative', sourceWorkbookId: 'example-workbook', sourceSheetId: 300,
      sourceCell: 'C4', sourceRow: 4, period: '2026-01-01', role: 'input', amountMinor: 999, cellState: 'value',
      isPrimary: false, isActual: false, sourceHash: 'example',
    }],
    reconciliation: [{
      sourceWorkbookId: 'example-workbook', sourceSheetId: 1455407915, sourceCell: 'N5', role: 'derived_metric',
      exactNumeric: '23001.075', includeInOperationalSum: false, sourceHash: 'example',
    }],
    invoices: [{
      sourceWorkbookId: 'example-workbook', sourceSheetId: 400, sourceRow: 2, invoiceNumber: 'example-1',
      paidMinor: 100, dueMinor: 0, cashClaim: 'source_marked_paid', evidenceIsLiveXero: false, sourceHash: 'example', party: 'Example client',
    }],
    planning: [{
      sourceWorkbookId: 'example-workbook', sourceSheetId: 500, sourceCell: 'A2', planKind: 'pipeline', sourceRow: 2,
      period: '2026-03-01', amountMinor: 200, status: 'Proposal', isActual: false, createsSale: false, party: 'Example prospect', sourceHash: 'example',
    }],
    ...extra,
  };
}

test('additional evidence stays separate from the baseline and does not read a sheet', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('network_disabled'); };
  const previous = process.env.SHEET_CSV_URL;
  delete process.env.SHEET_CSV_URL;
  try {
    const validated = validateAdditionalPacket(packet());
    assert.equal(validated.ok, true);
    assert.equal(validated.counts.completeExport, 7);
    assert.equal(validated.counts.partialExport, 1);
    assert.equal(validated.counts.missing, 4);
    assert.equal(validated.counts.primaryBaselineIncluded, 0);
    assert.equal(validated.counts.archiveCellsImported, 0);
    assert.equal(PRIMARY_BASELINE.snapshotHash, EXPECTED_SNAPSHOT_HASH);
    assert.equal(PRIMARY_BASELINE.recordCount, 377);
    assert.equal(ARCHIVE_STAYS_PARENT_SIDE.importIntoDatabase, false);
    const view = evidenceView(validated.stored);
    assert.equal(view.actuals.months['2026-01'].billing, 100);
    assert.equal(view.actuals.months['2026-01'].coverage, 'full');
    assert.equal(view.actuals.months['2026-08'].administration, 50);
    assert.equal(view.actuals.months['2026-08'].billing, null);
    assert.equal(view.actuals.months['2026-09'].billing, null);
    assert.equal(view.actuals.months['2026-09'].coverage, 'missing');
    assert.equal(view.alternative.includedInBaseline, false);
    assert.equal(view.reconciliation.includedInOperationalSum, false);
    assert.equal(view.invoices.liveXero, false);
    assert.equal(view.planning.createsSale, false);
    const withSubtotal = validateAdditionalPacket(packet({
      counts: { accountingLines: 3, alternativeCells: 1, reconciliation: 1, invoices: 1, planning: 1 },
      accountingLines: [line(), line({ sourceCell: 'B9', role: 'subtotal', amountMinor: 5000 }), line({ period: '2026-08-01', sourceCell: 'B3', amountMinor: 50, coverage: 'partial_export', groupId: 'administration' })],
    }));
    assert.equal(evidenceView(withSubtotal.stored).actuals.months['2026-01'].billing, 100);
    const baseline = modelFromStoredCells([{ label: 'Retained Clients', rowNumber: 3, month: '2026-01', kind: 'revenue', groupId: 'billing', sourceConfirmed: true, enteredMinor: 1000, nullState: 'amount' }]);
    assert.equal(overview(baseline, view.actuals, '2026-01').groups.find((group) => group.groupId === 'billing').actual.minor, 100);
    assert.equal(overview(baseline, null, '2026-01').groups.find((group) => group.groupId === 'billing').forecast.minor, 1000);

    assert.equal(validateAdditionalPacket(packet({
      accountingLines: [line({ period: '2026-09-01', amountMinor: 0, sourceCellState: 'formula_blank', coverage: 'missing' })],
    })).error, 'missing_has_amount');
    assert.equal(validateAdditionalPacket(packet({
      alternativeCells: [{ ...packet().alternativeCells[0], sourceSheetId: 1455407915 }],
    })).error, 'primary_duplicate');
    assert.equal(validateAdditionalPacket(packet({ sheetTitle: 'J Chase Tracker' })).error, 'personal_tracker_refused');
    assert.equal(validateAdditionalPacket(packet({ snapshotHash: EXPECTED_SNAPSHOT_HASH })).error, 'baseline_not_in_additional_packet');
    assert.equal(validateAdditionalPacket(packet({
      reconciliation: [{ ...packet().reconciliation[0], exactNumeric: 23001.075 }],
    })).error, 'exact_decimal_required');

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'toki-evidence-'));
    const env = { APP_STORE: 'file', APP_STORE_PATH: path.join(directory, 'store.enc'), APP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString('base64'), NODE_ENV: 'test' };
    const opened = openAppStore(env);
    await opened.store.saveBaseline([{ id: 'baseline-example', isActual: false }]);
    await opened.store.saveEvidence(validated.stored);
    await opened.store.savePlan({ id: 'plan-example', kind: 'cost', amountMinor: 250, currency: 'GBP', month: '2026-01', party: 'Example vendor', groupId: 'administration', timing: 'one_off', attestation: 'forecast' });
    const again = openAppStore(env);
    assert.equal((await again.store.listBaseline()).length, 1);
    assert.equal((await again.store.listEvidence()).alternativeCells[0].amountMinor, 999);
    assert.equal((await again.store.listPlans())[0].amountMinor, 250);
    const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'cockpit_evidence.sql'), 'utf8');
    assert.match(sql, /force row level security/);
    assert.match(sql, /revoke all on table cockpit.accounting_lines from public, anon, authenticated/);
    assert.equal(/grant [^;]+ to anon/i.test(sql), false);
    assert.equal(/alter table public\.runs/i.test(sql), false);
    assert.equal(/chase tracker/i.test(sql), false);
    assert.equal(/create table[^;]*forecast_baseline_cells/i.test(sql), false);
  } finally {
    global.fetch = originalFetch;
    if (previous == null) delete process.env.SHEET_CSV_URL;
    else process.env.SHEET_CSV_URL = previous;
  }
});
