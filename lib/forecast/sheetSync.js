const METRICS = new Set([
  'gross profit', 'monthly cost', 'jack salary', 'breakeven', 'tax',
  'profit pre-tax', 'profit post-tax', 'target', 'to hit target',
]);

export function normaliseSheetValue(value) {
  if (value == null) return '';
  return String(value).trim().replace(/£/g, '').replace(/,/g, '');
}

export function isMetricLabel(label) {
  return METRICS.has(String(label || '').trim().toLowerCase());
}

export function isInputCell(cell) {
  if (!cell) return false;
  const label = String(cell.label || '').trim().toLowerCase();
  if (!label || METRICS.has(label)) return false;
  if (cell.kind && !['revenue', 'cost', 'sale'].includes(cell.kind)) return false;
  return Boolean(cell.sourceCell || cell.source_cell);
}

// Stored rows keep `period` (a date). The import also sets `month` before that
// row is written. A save arrives as YYYY-MM, so the date wins when both exist.
export function forecastMonthKey(cell) {
  const period = cell?.period == null ? '' : String(cell.period);
  const fromPeriod = period.match(/^(\d{4}-\d{2})/);
  if (fromPeriod) return fromPeriod[1];
  const month = cell?.month == null ? '' : String(cell.month);
  const fromMonth = month.match(/^(\d{4}-\d{2})/);
  return fromMonth ? fromMonth[1] : null;
}

export function findForecastInput(cells, { label, month } = {}) {
  const key = String(month || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(key)) return null;
  return (cells || []).find((cell) => cell?.label === label && forecastMonthKey(cell) === key && isInputCell(cell)) || null;
}

export function decideSheetWrite({ current, lastSynced, stored, next }) {
  const sheet = normaliseSheetValue(current);
  if (sheet.startsWith('=')) return { action: 'skip', reason: 'formula' };
  const baseline = lastSynced == null ? normaliseSheetValue(stored) : normaliseSheetValue(lastSynced);
  const incoming = normaliseSheetValue(next);
  if (sheet !== baseline && sheet !== incoming) {
    return { action: 'conflict', reason: 'sheet_changed', current: sheet, lastSynced: baseline };
  }
  return { action: 'write', reason: null, current: sheet, next: incoming };
}

export function poundsFromMinor(minor) {
  if (minor == null || !Number.isFinite(Number(minor))) return '';
  const pounds = Number(minor) / 100;
  return Number.isInteger(pounds) ? String(pounds) : String(Math.round(pounds * 100) / 100);
}
