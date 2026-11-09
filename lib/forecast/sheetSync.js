const METRICS = new Set([
  'gross profit', 'monthly cost', 'jack salary', 'breakeven', 'tax',
  'profit pre-tax', 'profit post-tax', 'target', 'to hit target',
]);

export function normaliseSheetValue(value) {
  if (value == null) return '';
  return String(value).trim().replace(/£/g, '').replace(/,/g, '');
}

export function isInputCell(cell) {
  if (!cell) return false;
  const label = String(cell.label || '').trim().toLowerCase();
  if (!label || METRICS.has(label)) return false;
  if (cell.kind && !['revenue', 'cost', 'sale'].includes(cell.kind)) return false;
  return Boolean(cell.sourceCell || cell.source_cell);
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
