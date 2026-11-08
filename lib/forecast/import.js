import crypto from 'crypto';
import { selectBaseline, BASELINE_SHEET_ID, BASELINE_TITLE, consistentMonthlyCost } from '../pnl/parseFirstTab.js';
import { EXPECTED_SNAPSHOT_HASH } from '../store/target.js';

export const STORE_TARGET = {
  applied: false,
  appStoreActivated: false,
  projectName: 'toki-admin-dash',
  projectRef: 'hcjybjpimqzsueyslxvl',
  region: 'eu-west-1',
  preserve: ['public.runs'],
  doNotTouch: [
    { name: 'personal-jrl', projectRef: 'uxkpqmyzxtjmmixlycio' },
    { name: 'aa', projectRef: 'cvtqeyqgjuvpktwbiziq', reason: 'excluded' },
  ],
};

// Verified on the first tab. The stored Monthly Cost cell is left as written.
export const VERIFIED_FORMULA_FLAGS = [{
  sheetId: BASELINE_SHEET_ID,
  month: '2027-01',
  code: 'source_sum_omits_inputs',
  omittedMinor: 3650,
  repair: false,
}];

// One-time migration of the first Forecast Profit & Loss tab.
// The running app does not read Google Sheets. These rows are forecasts, not actuals.

export const EXPECTED_SNAPSHOT_SHAPE = {
  recordCount: 377,
  periodCount: 13,
  sourceRowCount: 29,
  value: 256,
  blank: 72,
  zero: 49,
  groupNull: 39,
};

export function summarizeSnapshot(records) {
  const periods = new Set();
  const rows = new Set();
  const states = { value: 0, blank: 0, zero: 0 };
  let groupNull = 0;
  const errors = [];
  for (const record of records || []) {
    periods.add(record.period);
    rows.add(record.source_row);
    states[record.cell_state] = (states[record.cell_state] || 0) + 1;
    if (record.group == null) groupNull += 1;
    if (record.cell_state === 'blank' && record.value != null) errors.push('blank_has_value');
    if (record.cell_state === 'zero' && record.value !== 0) errors.push('zero_not_zero');
    if (record.cell_state === 'value' && (record.value == null || record.value === 0)) errors.push('value_empty');
    if (record.scenario !== 'forecast') errors.push('scenario');
  }
  return {
    recordCount: (records || []).length,
    periodCount: periods.size,
    sourceRowCount: rows.size,
    value: states.value,
    blank: states.blank,
    zero: states.zero,
    groupNull,
    errors,
  };
}

export function snapshotMatchesExpected(summary) {
  const expected = EXPECTED_SNAPSHOT_SHAPE;
  return summary.errors.length === 0
    && summary.recordCount === expected.recordCount
    && summary.periodCount === expected.periodCount
    && summary.sourceRowCount === expected.sourceRowCount
    && summary.value === expected.value
    && summary.blank === expected.blank
    && summary.zero === expected.zero
    && summary.groupNull === expected.groupNull;
}

function columnLetters(index) {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function minorFromRecord(record) {
  if (record.cell_state === 'blank') {
    if (record.value != null || record.value_minor != null) return { error: 'blank_has_value' };
    return { minor: null };
  }
  if (record.cell_state === 'zero') {
    if (record.value != null && record.value !== 0) return { error: 'zero_not_zero' };
    if (record.value_minor != null && record.value_minor !== 0) return { error: 'zero_not_zero' };
    return { minor: 0 };
  }
  if (Number.isInteger(record.value_minor) && record.value_minor !== 0) return { minor: record.value_minor };
  if (typeof record.value === 'string' && /^-?\d+(\.\d{1,2})?$/.test(record.value)) {
    const negative = record.value.startsWith('-');
    const [whole, frac = ''] = record.value.replace('-', '').split('.');
    const minor = (Number(whole) * 100) + Number((frac + '00').slice(0, 2));
    if (!Number.isInteger(minor) || minor === 0) return { error: 'decimal_string_required' };
    return { minor: negative ? -minor : minor };
  }
  return { error: 'decimal_string_required' };
}

export function importNormalized(records, { spreadsheetId, sheetId, fullSnapshot = false } = {}) {
  if (!spreadsheetId || sheetId == null) return { ok: false, error: 'source_required' };
  const summary = summarizeSnapshot(records);
  if (summary.errors.length) return { ok: false, error: 'shape_invalid', summary };
  if (fullSnapshot && !snapshotMatchesExpected(summary)) return { ok: false, error: 'shape_mismatch', summary };
  const cells = [];
  for (const record of records || []) {
    const money = minorFromRecord(record);
    if (money.error) return { ok: false, error: money.error };
    const cellState = record.cell_state;
    cells.push({
      id: `baseline:${spreadsheetId}:${sheetId}:${record.source_cell}:${record.period}`,
      spreadsheetId: String(spreadsheetId),
      sheetId,
      sourceCell: record.source_cell,
      rowNumber: record.source_row,
      label: record.label,
      period: record.period,
      scenario: 'forecast',
      cellState,
      nullState: cellState === 'value' ? 'amount' : cellState,
      enteredMinor: money.minor,
      effectiveMinor: money.minor,
      amountMinor: money.minor,
      groupId: record.group ?? null,
      userEntered: record.user_entered ?? null,
      displayed: record.displayed ?? null,
      currency: 'GBP',
      provenance: 'forecast_baseline',
      isActual: false,
      sourceHash: sourceHash({
        workbookRef: String(spreadsheetId),
        tabRef: String(sheetId),
        cellRef: record.source_cell,
        period: record.period,
        label: record.label,
        nullState: cellState,
        enteredMinor: money.minor,
      }),
    });
  }
  const hash = snapshotHash((records || []).map((record) => ({
    source_cell: record.source_cell,
    source_row: record.source_row,
    period: record.period,
    cell_state: record.cell_state,
    value: record.value ?? record.value_minor ?? null,
    group: record.group ?? null,
  })));
  if (fullSnapshot && hash !== EXPECTED_SNAPSHOT_HASH) {
    return { ok: false, error: 'hash_mismatch' };
  }
  for (const cell of cells) cell.snapshotHash = hash;
  return { ok: true, cells, snapshotHash: hash, summary, actuals: null, isActual: false };
}

export function snapshotHash(records) {
  const canonical = [...(records || [])].map((record) => ({
    source_cell: record.source_cell,
    source_row: record.source_row,
    period: record.period,
    cell_state: record.cell_state,
    value: record.value ?? null,
    group: record.group ?? null,
  })).sort((a, b) => `${a.source_row}:${a.source_cell}:${a.period}`.localeCompare(`${b.source_row}:${b.source_cell}:${b.period}`));
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function importBaseline(sheets, { spreadsheetId } = {}) {
  if (!spreadsheetId) return { ok: false, error: 'spreadsheet_id_required' };
  const selected = selectBaseline(sheets);
  const model = selected.baseline;
  if (!model) return { ok: false, error: 'baseline_tab_missing', rejected: selected.rejected };
  if (model.sheetId !== BASELINE_SHEET_ID && model.title !== BASELINE_TITLE) {
    return { ok: false, error: 'not_first_tab' };
  }
  const cells = [];
  for (const row of model.rows || []) {
    if (!['revenue', 'cost', 'metric'].includes(row.kind)) continue;
    for (const month of model.months || []) {
      const cell = row.cells?.[month.key];
      const blank = !cell || cell.blank || cell.minor == null;
      const enteredMinor = blank ? null : cell.minor;
      const nullState = blank ? 'blank' : enteredMinor === 0 ? 'zero' : 'amount';
      const sourceConfirmed = row.group?.sourceConfirmed === true;
      const record = {
        id: `baseline:${spreadsheetId}:${model.sheetId}:${row.rowNumber}:${month.key}`,
        spreadsheetId: String(spreadsheetId),
        sheetId: model.sheetId,
        sheetTitle: model.title,
        sourceVersion: 'forecast-profit-and-loss',
        workbookRef: String(spreadsheetId),
        tabRef: `${model.title}#${model.sheetId}`,
        cellRef: `R${row.rowNumber}C${month.index ?? ''}`,
        sourceCell: month.index == null ? null : `${columnLetters(month.index)}${row.rowNumber}`,
        cellState: nullState === 'amount' ? 'value' : nullState,
        rowNumber: row.rowNumber,
        label: row.label,
        kind: row.kind,
        groupId: sourceConfirmed ? row.group.groupId : null,
        suggestedGroupId: sourceConfirmed ? null : row.group?.groupId || null,
        sourceConfirmed,
        month: month.key,
        period: `${month.key}-01`,
        nullState,
        enteredMinor,
        effectiveMinor: enteredMinor,
        amountMinor: enteredMinor,
        currency: 'GBP',
        provenance: 'forecast_baseline',
        isActual: false,
      };
      record.sourceHash = sourceHash(record);
      cells.push(record);
    }
  }
  const hash = snapshotHash(cells.map((cell) => ({
    source_cell: cell.sourceCell,
    source_row: cell.rowNumber,
    period: cell.period,
    cell_state: cell.cellState,
    value: cell.enteredMinor,
    group: cell.groupId,
  })));
  for (const cell of cells) cell.snapshotHash = hash;
  return {
    ok: true,
    cells,
    rejected: selected.rejected,
    reconciliation: reconcileBaseline(model),
    anomaly: model.anomaly || null,
    formulaFlags: formulaFlags(model),
    grossProfitMeaning: model.grossProfitMeaning,
  };
}

function formulaFlags(model) {
  return VERIFIED_FORMULA_FLAGS.filter((flag) => flag.sheetId === model.sheetId).map((flag) => ({
    ...flag,
    repair: false,
    appliedToStoredCell: false,
  }));
}

export function sourceHash(record) {
  const canonical = JSON.stringify({
    workbookRef: record.workbookRef,
    tabRef: record.tabRef,
    cellRef: record.cellRef,
    period: record.period,
    label: record.label,
    nullState: record.nullState,
    enteredMinor: record.enteredMinor,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function reconcileBaseline(model) {
  const months = (model.months || []).map((month) => month.key);
  const warnings = [];
  const groups = {};
  for (const month of months) {
    const lines = (model.rows || []).filter((row) => row.kind === 'revenue' || row.kind === 'cost');
    for (const row of lines) {
      const id = row.group?.groupId;
      if (!id) continue;
      const cell = row.cells?.[month];
      if (!cell || cell.blank || cell.minor == null) continue;
      groups[id] = groups[id] || {};
      groups[id][month] = (groups[id][month] || 0) + cell.minor;
    }
    const gross = metric(model, 'Gross Profit', month);
    const billing = groups.billing?.[month];
    if (gross != null && billing != null && gross !== billing) {
      warnings.push({ month, code: 'gross_profit_differs_from_billing_lines', stated: gross, summed: billing });
    }
    const statedCost = metric(model, 'Monthly Cost', month);
    const summedCost = consistentMonthlyCost(model, month);
    if (statedCost != null && summedCost != null && statedCost !== summedCost) {
      warnings.push({ month, code: 'monthly_cost_differs_from_cost_lines', stated: statedCost, summed: summedCost, replaced: false });
    }
  }
  return {
    ok: warnings.length === 0,
    groups,
    warnings,
    actualsImported: 0,
    forecastsAreActuals: false,
  };
}

function metric(model, label, month) {
  const row = (model.rows || []).find((item) => item.label === label);
  const cell = row?.cells?.[month];
  if (!cell || cell.blank || cell.minor == null) return null;
  return cell.minor;
}

export function upsertBaseline(existing, cells) {
  const byId = new Map((existing || []).map((row) => [row.id, row]));
  let created = 0;
  let updated = 0;
  for (const cell of cells) {
    if (byId.has(cell.id)) updated += 1;
    else created += 1;
    byId.set(cell.id, cell);
  }
  return { cells: [...byId.values()], created, updated };
}
