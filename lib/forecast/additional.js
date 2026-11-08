import { EXPECTED_SNAPSHOT_HASH } from '../store/target.js';
import { BASELINE_SHEET_ID } from '../pnl/parseFirstTab.js';

// Additional evidence only. The 377 primary cells and their snapshot hash stay where they are.
// The 21-tab workbook backup stays on the parent side. The personal tracker is refused.

export const PRIMARY_BASELINE = {
  snapshotHash: EXPECTED_SNAPSHOT_HASH,
  recordCount: 377,
  sheetId: BASELINE_SHEET_ID,
  resendInThisPacket: false,
};

export const ARCHIVE_STAYS_PARENT_SIDE = {
  workbookTabs: 21,
  populatedCells: 3524,
  formulas: 833,
  importIntoDatabase: false,
};

export const ACCOUNTING_PERIODS = [
  ['2026-01-01', 'complete_export'],
  ['2026-02-01', 'complete_export'],
  ['2026-03-01', 'complete_export'],
  ['2026-04-01', 'complete_export'],
  ['2026-05-01', 'complete_export'],
  ['2026-06-01', 'complete_export'],
  ['2026-07-01', 'complete_export'],
  ['2026-08-01', 'partial_export'],
  ['2026-09-01', 'missing'],
  ['2026-10-01', 'missing'],
  ['2026-11-01', 'missing'],
  ['2026-12-01', 'missing'],
].map(([period, coverage]) => ({ period, coverage, basis: 'unknown', currency: 'GBP' }));

const GROUPS = ['billing', 'administration', 'finance', 'premises', 'selling', 'people'];
const LINE_ROLES = ['account', 'subtotal', 'tax', 'profit'];
const PLAN_KINDS = ['monthly_client', 'pipeline', 'expected_invoice', 'reconciliation_note', 'additional_cost'];

function exactDecimal(value) {
  return typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value);
}

function integerMinor(value) {
  return value == null || (Number.isInteger(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER);
}

function personal(value) {
  return /j\s*chase\s*tracker|personal_archive/i.test(String(value || ''));
}

export function validateAdditionalPacket(packet = {}) {
  const errors = [];
  if (packet.baseline || packet.records?.primary || packet.snapshotHash) errors.push('baseline_not_in_additional_packet');
  if (personal(packet.sheetTitle) || personal(packet.evidenceClass)) errors.push('personal_tracker_refused');
  const periods = packet.accountingPeriods || [];
  if (JSON.stringify(periods.map((row) => [row.period, row.coverage])) !== JSON.stringify(ACCOUNTING_PERIODS.map((row) => [row.period, row.coverage]))) {
    errors.push('accounting_coverage');
  }
  const lines = packet.accountingLines || [];
  const alternative = packet.alternativeCells || [];
  const reconciliation = packet.reconciliation || [];
  const invoices = packet.invoices || [];
  const planning = packet.planning || [];
  const coverageByPeriod = Object.fromEntries(ACCOUNTING_PERIODS.map((row) => [row.period, row.coverage]));
  for (const line of lines) {
    if (personal(line.accountLabel) || personal(line.sheetTitle) || line.evidenceClass === 'personal_archive') errors.push('personal_tracker_refused');
    if (line.evidenceClass === 'primary_forecast' || (line.sourceSheetId === BASELINE_SHEET_ID && line.role === 'input')) errors.push('primary_duplicate');
    if (!LINE_ROLES.includes(line.role)) errors.push('accounting_role');
    if (line.groupId != null && !GROUPS.includes(line.groupId)) errors.push('accounting_group');
    if (!integerMinor(line.amountMinor)) errors.push('minor_not_integer');
    if (line.exactNumeric != null && !exactDecimal(line.exactNumeric)) errors.push('exact_decimal_required');
    const coverage = coverageByPeriod[line.period];
    if (!coverage) errors.push('accounting_period');
    if ((coverage === 'missing' || line.sourceCellState === 'blank' || line.sourceCellState === 'formula_blank') && (line.amountMinor != null || line.exactNumeric != null)) {
      errors.push('missing_has_amount');
    }
    if (line.sourceCellState === 'zero' && line.amountMinor !== 0) errors.push('zero_not_zero');
  }
  for (const cell of alternative) {
    if (personal(cell.label) || personal(cell.sheetTitle) || cell.evidenceClass === 'personal_archive') errors.push('personal_tracker_refused');
    if (cell.isPrimary === true || cell.sourceSheetId === BASELINE_SHEET_ID || cell.evidenceClass === 'primary_forecast') errors.push('primary_duplicate');
    if (cell.isActual !== false) errors.push('alternative_marked_actual');
    if (!integerMinor(cell.amountMinor)) errors.push('minor_not_integer');
    if (cell.exactNumeric != null && !exactDecimal(cell.exactNumeric)) errors.push('exact_decimal_required');
    if (cell.role === 'annual_total' || cell.role === 'derived_metric') errors.push('derived_in_scenario');
  }
  for (const row of reconciliation) {
    if (row.role !== 'annual_total' && row.role !== 'derived_metric') errors.push('reconciliation_role');
    if (row.exactNumeric != null && !exactDecimal(row.exactNumeric)) errors.push('exact_decimal_required');
    if (row.includeInOperationalSum === true) errors.push('derived_double_count');
  }
  for (const invoice of invoices) {
    if (invoice.evidenceIsLiveXero !== false) errors.push('invoice_not_historical');
    if (!['source_marked_paid', 'not_proven'].includes(invoice.cashClaim)) errors.push('cash_claim');
    if (!integerMinor(invoice.paidMinor) || !integerMinor(invoice.dueMinor)) errors.push('minor_not_integer');
  }
  for (const row of planning) {
    if (!PLAN_KINDS.includes(row.planKind)) errors.push('plan_kind');
    if (row.isActual !== false || row.createsSale === true) errors.push('plan_is_not_sale');
    if (!integerMinor(row.amountMinor)) errors.push('minor_not_integer');
    if (row.probabilityExact != null && !exactDecimal(row.probabilityExact)) errors.push('exact_decimal_required');
  }
  const counts = {
    accountingPeriods: 12,
    completeExport: 7,
    partialExport: 1,
    missing: 4,
    accountingLines: lines.length,
    alternativeCells: alternative.length,
    reconciliation: reconciliation.length,
    invoices: invoices.length,
    planning: planning.length,
    primaryBaselineIncluded: 0,
    personalTrackerIncluded: 0,
    archiveCellsImported: 0,
  };
  if (packet.counts) {
    for (const key of ['accountingLines', 'alternativeCells', 'reconciliation', 'invoices', 'planning']) {
      if (packet.counts[key] !== counts[key]) errors.push('count_mismatch');
    }
  }
  const unique = new Set(errors);
  if (unique.size) return { ok: false, error: [...unique][0], errors: [...unique], counts };
  return {
    ok: true,
    counts,
    stored: {
      accountingPeriods: ACCOUNTING_PERIODS,
      accountingLines: lines.map((line) => ({ ...line, id: `${line.sourceWorkbookId}:${line.sourceSheetId}:${line.sourceCell}` })),
      alternativeCells: alternative.map((cell) => ({ ...cell, id: `${cell.scenarioId}:${cell.sourceCell}` })),
      reconciliation: reconciliation.map((row) => ({ ...row, id: `${row.sourceSheetId}:${row.sourceCell}` })),
      invoices: invoices.map((row) => ({ ...row, id: `${row.sourceSheetId}:${row.sourceRow}` })),
      planning: planning.map((row) => ({ ...row, id: `${row.sourceSheetId}:${row.sourceCell}:${row.planKind}` })),
    },
  };
}

function groupAmount(lines) {
  const accounts = lines.filter((line) => line.role === 'account');
  if (!accounts.length) return null;
  if (accounts.some((line) => line.amountMinor == null)) return null;
  return accounts.reduce((sum, line) => sum + line.amountMinor, 0);
}

export function evidenceView(stored) {
  const months = {};
  for (const period of stored?.accountingPeriods || ACCOUNTING_PERIODS) {
    const key = period.period.slice(0, 7);
    const lines = (stored?.accountingLines || []).filter((line) => line.period === period.period);
    const coverage = period.coverage === 'complete_export' ? 'full' : period.coverage === 'partial_export' ? 'partial' : 'missing';
    const entry = { coverage };
    for (const groupId of GROUPS) {
      entry[groupId] = coverage === 'missing' ? null : groupAmount(lines.filter((line) => line.groupId === groupId));
    }
    months[key] = entry;
  }
  return {
    source: 'stored_evidence',
    sheetRuntime: false,
    actuals: {
      synthetic: false,
      basis: 'unknown',
      vat: 'unknown',
      peopleKnown: false,
      source: 'historical_accounting_export',
      liveXero: false,
      months,
    },
    alternative: {
      label: 'V2',
      includedInBaseline: false,
      cells: stored?.alternativeCells || [],
    },
    reconciliation: {
      includedInOperationalSum: false,
      rows: stored?.reconciliation || [],
    },
    invoices: {
      liveXero: false,
      rows: (stored?.invoices || []).map((row) => ({ ...row, xeroVerified: false })),
    },
    planning: {
      createsSale: false,
      rows: stored?.planning || [],
    },
  };
}
