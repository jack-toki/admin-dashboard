import { numericSheetValue, decideSheetWrite, poundsFromMinor } from './sheetSync.js';

// Private planning tab. Not published. Labels below are the ones on the Sheet.
export const PIPELINE_TAB = 'Pipeline Forecast V2';
export const PIPELINE_SHEET_ID = 332229385;
export const PIPELINE_RANGE = "'Pipeline Forecast V2'!A1:P120";

const SUMMARY = new Set(['target', 'total revenue', 'active', 'gap', 'potential']);

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

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function isSection(label) {
  return /^\d+%/.test(label) || /^(projects|retainers|hosting|pipeline|backburner)$/i.test(label);
}

function cellAt(values, formulas, row, column) {
  const raw = values?.[row]?.[column] ?? '';
  const formula = String(formulas?.[row]?.[column] || '').trim();
  const formulaCell = formula.startsWith('=');
  const display = raw == null || raw === '' ? '' : String(raw);
  const minor = numericSheetValue(raw);
  return {
    a1: `${columnLetters(column)}${row + 1}`,
    display,
    minor: minor == null ? null : Math.round(minor * 100),
    formula: formulaCell,
    input: !formulaCell && !/^total$/i.test(display.trim()) && minor != null,
  };
}

export function parsePipelinePlan(values, formulas) {
  const header = values?.[1] || [];
  const months = [];
  header.forEach((label, index) => {
    const text = clean(label);
    if (index >= 4 && text) months.push({ index, label: text });
  });
  const rows = [];
  let section = '';
  for (let row = 0; row < (values || []).length; row += 1) {
    if (row === 1) continue;
    const sheetLabel = clean(values[row]?.[0]);
    const marker = clean(values[row]?.[3]);
    const cells = months.map((month) => ({ header: month.label, ...cellAt(values, formulas, row, month.index) }));
    const total = cellAt(values, formulas, row, 3);
    const hasMoney = cells.some((cell) => cell.display) || (total.display && !/^total$/i.test(total.display));
    if (!sheetLabel && !hasMoney && !/^total$/i.test(marker)) continue;
    let kind = 'line';
    if (SUMMARY.has(sheetLabel.toLowerCase())) kind = 'summary';
    else if (isSection(sheetLabel)) kind = 'section';
    else if (!sheetLabel && /^total$/i.test(marker)) kind = 'section-total';
    else if (!sheetLabel) kind = 'note';
    if (kind === 'section') section = sheetLabel;
    const editable = kind === 'line' || (kind === 'summary' && sheetLabel.toLowerCase() === 'target');
    if (editable) {
      for (const cell of cells) {
        if (!cell.formula) cell.input = true;
      }
      if (kind === 'line' && !total.formula && !/^total$/i.test(total.display.trim())) total.input = true;
    }
    rows.push({
      row: row + 1,
      label: sheetLabel || marker,
      sheetLabel,
      section,
      source: clean(values[row]?.[1]),
      work: clean(values[row]?.[2]),
      kind,
      total,
      cells,
    });
  }
  return { tab: PIPELINE_TAB, sheetId: PIPELINE_SHEET_ID, range: PIPELINE_RANGE, months: months.map((month) => month.label), rows };
}

export function pipelineView(plan) {
  const points = (plan?.months || []).map((label) => ({ id: label, label }));
  const valueOf = (cell) => (cell?.minor == null ? null : cell.minor / 100);
  const active = (plan?.rows || []).find((row) => row.sheetLabel.toLowerCase() === 'active');
  const series = [];
  if (active) {
    series.push({
      id: 'active',
      label: active.sheetLabel,
      kind: 'history',
      values: active.cells.map((cell) => ({ id: cell.header, value: valueOf(cell), status: 'Sheet total' })),
    });
  }
  let band = null;
  let buckets = null;
  function flushBand() {
    if (!band) return;
    series.push({
      id: band.sheetLabel,
      label: band.sheetLabel,
      kind: 'forecast',
      values: (plan?.months || []).map((label, index) => ({
        id: label,
        value: buckets[index] == null ? 0 : buckets[index],
        status: 'Scenario',
      })),
    });
    band = null;
    buckets = null;
  }
  for (const row of plan?.rows || []) {
    if (row.kind === 'section' && /^\d+%/.test(row.sheetLabel)) {
      flushBand();
      band = row;
      buckets = (plan?.months || []).map(() => null);
    } else if (row.kind === 'section') flushBand();
    else if (band && row.kind === 'line') {
      row.cells.forEach((cell, index) => {
        if (cell.minor == null) return;
        buckets[index] = (buckets[index] || 0) + cell.minor / 100;
      });
    }
  }
  flushBand();
  const tiles = [];
  if (active) tiles.push({ label: active.sheetLabel, minor: active.total.minor });
  for (const row of plan?.rows || []) {
    if (/^\d+%/.test(row.sheetLabel)) tiles.push({ label: row.sheetLabel, minor: row.total.minor });
  }
  return { points, series, tiles };
}

export function findPipelineCell(plan, a1) {
  for (const row of plan?.rows || []) {
    for (const cell of row.cells) {
      if (cell.a1 === a1) return { ...cell, label: row.sheetLabel || row.label, section: row.section };
    }
  }
  return null;
}

export function preparePipelineWrite(cell, { current, stored, next }) {
  if (!cell || cell.formula || !cell.input) return { action: 'skip', reason: 'formula' };
  return decideSheetWrite({ current, lastSynced: stored, stored, next: poundsFromMinor(next) });
}

