import { parseAmount } from '../money.js';
import { classifyLine } from '../groups.js';

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const METRICS = new Set([
  'gross profit', 'monthly cost', 'jack salary', 'breakeven', 'tax',
  'profit pre-tax', 'profit post-tax', 'target', 'to hit target',
]);

export const BASELINE_TITLE = 'Forecast Profit & Loss';
export const BASELINE_SHEET_ID = 1455407915;

export function selectBaseline(sheets) {
  const baseline = (sheets || []).find((sheet) => (
    sheet.sheetId === BASELINE_SHEET_ID || sheet.title === BASELINE_TITLE
  ));
  const rejected = (sheets || []).filter((sheet) => sheet !== baseline).map((sheet) => ({
    title: sheet.title,
    sheetId: sheet.sheetId,
    role: /v2/i.test(sheet.title || '') ? 'different_baseline_not_used' : 'supporting',
  }));
  return {
    baseline: baseline ? { ...parseFirstTab(baseline.grid, baseline), sourceVersion: 'forecast-profit-and-loss' } : null,
    rejected,
  };
}

function monthFromHeader(text) {
  const raw = String(text || '').trim();
  const named = raw.match(/^(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(20\d{2}))?$/i);
  if (!named) return null;
  const month = MONTHS[named[1].toLowerCase()];
  const year = named[2] ? Number(named[2]) : null;
  return { month, year };
}

export function parseFirstTab(grid, meta = {}) {
  const rows = grid || [];
  const headerIndex = rows.findIndex((row) => (row || []).some((cell) => monthFromHeader(cell)?.year == null && monthFromHeader(cell)));
  const header = headerIndex >= 0 ? rows[headerIndex] : [];
  let impliedYear = 2026;
  const columns = header.map((cell, index) => {
    const parsed = monthFromHeader(cell);
    if (!parsed) {
      if (index > 0 && String(cell || '').trim() === '') return { index, role: 'unlabelled', key: null };
      return { index, role: 'label', key: null, header: String(cell || '') };
    }
    const year = parsed.year || impliedYear;
    if (parsed.year) impliedYear = parsed.year;
    const key = `${year}-${String(parsed.month).padStart(2, '0')}`;
    return { index, role: 'month', key, header: String(cell || '').trim(), year, month: parsed.month };
  });
  // A blank column sitting between December and a later January is the annual total, not a month.
  for (let i = 0; i < columns.length; i += 1) {
    const prev = columns[i - 1];
    const next = columns[i + 1];
    if (columns[i].role === 'unlabelled' && prev?.month === 12 && next?.month === 1 && next.year === prev.year + 1) {
      columns[i] = { ...columns[i], role: 'year_total', key: `${prev.year}-total` };
    }
  }

  const months = columns.filter((column) => column.role === 'month');
  const parsedRows = [];
  let section = null;
  for (let r = headerIndex + 1; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const label = String(row[0] || '').trim();
    if (!label && row.every((cell) => String(cell || '').trim() === '')) continue;
    const lower = label.toLowerCase();
    if (lower === 'billing' || lower === 'costs') {
      section = lower;
      parsedRows.push({ rowNumber: r + 1, label, kind: 'section' });
      continue;
    }
    const cells = {};
    for (const column of columns) {
      if (!column.key) continue;
      const amount = parseAmount(row[column.index]);
      cells[column.key] = amount.ok ? { minor: amount.minor, blank: false } : { minor: null, blank: true };
    }
    const kind = METRICS.has(lower) ? 'metric' : section === 'billing' ? 'revenue' : section === 'costs' ? 'cost' : 'other';
    const grouping = kind === 'revenue' || kind === 'cost' ? classifyLine(label) : null;
    parsedRows.push({
      rowNumber: r + 1,
      label: label || '(unlabeled)',
      unlabeled: !label,
      kind,
      section,
      group: grouping,
      cells,
    });
    if (lower === '2027') section = null;
  }

  const formulas = meta.formulas || [];
  const monthlyCost = parsedRows.find((row) => row.label.toLowerCase() === 'monthly cost');
  const anomaly = monthlyCost ? detectRangeAnomaly(formulas[monthlyCost.rowNumber - 1], columns) : null;

  return {
    title: meta.title || BASELINE_TITLE,
    sheetId: meta.sheetId ?? BASELINE_SHEET_ID,
    sourceVersion: 'forecast-profit-and-loss',
    months,
    columns,
    rows: parsedRows,
    anomaly,
    grossProfitMeaning: 'The sheet labels this row Gross Profit. On this tab it is the sum of the billing lines, not profit after costs.',
  };
}

export function detectRangeAnomaly(formulaRow, columns) {
  if (!formulaRow) return null;
  const spans = [];
  for (const column of columns || []) {
    if (column.role !== 'month' && column.role !== 'year_total') continue;
    const formula = String(formulaRow[column.index] || '');
    const match = formula.match(/SUM\(\s*([A-Z]+)(\d+)\s*:\s*\1(\d+)\s*\)/i);
    if (!match) continue;
    spans.push({
      key: column.key,
      start: Number(match[2]),
      end: Number(match[3]),
      formula,
    });
  }
  if (spans.length < 2) return null;
  const minStart = Math.min(...spans.map((span) => span.start));
  const odd = spans.filter((span) => span.start !== minStart);
  if (!odd.length) return null;
  return {
    code: 'monthly_cost_range_differs',
    message: 'One Monthly Cost formula does not cover the same rows as the others. The sheet value is left as written. This dashboard does not treat the shorter range as the correct total.',
    spans,
    omittedFrom: odd.map((span) => ({
      key: span.key,
      formula: span.formula,
      omittedRows: Array.from({ length: span.start - minStart }, (_, index) => minStart + index),
    })),
  };
}

export function consistentMonthlyCost(model, monthKey) {
  const lines = (model.rows || []).filter((row) => row.kind === 'cost');
  let total = 0;
  let seen = 0;
  for (const line of lines) {
    const cell = line.cells?.[monthKey];
    if (!cell || cell.blank || cell.minor == null) continue;
    total += cell.minor;
    seen += 1;
  }
  return seen ? total : null;
}
