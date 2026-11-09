import { importBaseline } from './import.js';
import { isMetricLabel } from './sheetSync.js';
import { serviceAccount, fetchServiceToken, readTabGrid } from '../google/sheets.js';

// The profiles workbook behind SHEET_CSV_URL is the public dashboard, not this forecast.
// A live forecast read uses the service account on the private Sheet. Stored cells are the cache.

export function forecastSheetConfigured(env = process.env) {
  return Boolean(serviceAccount(env));
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

export function markFormulaCells(cells, grid) {
  const bySource = new Map((cells || []).filter((cell) => cell.sourceCell).map((cell) => [cell.sourceCell, cell]));
  (grid || []).forEach((row, rowIndex) => {
    (row || []).forEach((value, columnIndex) => {
      if (!String(value || '').trim().startsWith('=')) return;
      const hit = bySource.get(`${columnLetters(columnIndex)}${rowIndex + 1}`);
      if (hit) hit.formula = true;
    });
  });
  return cells;
}

function monthKey(cell) {
  if (cell?.month && /^\d{4}-\d{2}/.test(String(cell.month))) return String(cell.month).slice(0, 7);
  const match = String(cell?.period || '').match(/^(\d{4}-\d{2})/);
  return match ? match[1] : '';
}

export function cacheKey(cell) {
  const source = String(cell?.sourceCell || cell?.source_cell || '').trim();
  const period = monthKey(cell) ? `${monthKey(cell)}-01` : '';
  return `${source}:${period}`;
}

export function isCacheInput(cell) {
  const label = String(cell?.label || '').trim();
  if (!label || /^(20\d{2})$/.test(label)) return false;
  if (cell?.formula === true || isMetricLabel(label)) return false;
  if (cell?.kind && !['revenue', 'cost', 'sale'].includes(cell.kind)) return false;
  if (!/^\d{4}-\d{2}$/.test(monthKey(cell))) return false;
  return Boolean(cell?.sourceCell || cell?.source_cell);
}

export function refreshStoredBaseline(stored, liveCells) {
  const incoming = new Map();
  for (const cell of liveCells || []) {
    if (!isCacheInput(cell)) continue;
    const key = cacheKey(cell);
    if (!key || key.startsWith(':') || key.endsWith(':')) continue;
    incoming.set(key, cell);
  }
  return (stored || []).map((cell) => {
    const next = incoming.get(cacheKey(cell));
    if (!next) return cell;
    const entered = next.enteredMinor ?? next.amountMinor ?? null;
    const blank = entered == null;
    const zero = entered === 0;
    return {
      ...cell,
      enteredMinor: entered,
      amountMinor: entered,
      effectiveMinor: entered,
      cellState: blank ? 'blank' : zero ? 'zero' : 'value',
      nullState: blank ? 'blank' : zero ? 'zero' : 'amount',
      provenance: 'forecast_sheet',
    };
  });
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (char !== '\r') cell += char;
  }
  row.push(cell);
  if (row.some((item) => item !== '')) rows.push(row);
  return rows;
}

export async function readForecastSheet(env = process.env, fetchImpl = fetch) {
  const account = serviceAccount(env);
  if (!account) return { ok: false, configured: false, reason: 'not_configured', cells: [] };
  let token;
  try {
    token = await fetchServiceToken(account, fetchImpl);
  } catch {
    return { ok: false, configured: true, reason: 'token', cells: [] };
  }
  if (!token) return { ok: false, configured: true, reason: 'token', cells: [] };
  const values = await readTabGrid(account, token, 'UNFORMATTED_VALUE', fetchImpl);
  if (!values.ok) return { ok: false, configured: true, reason: values.reason, cells: [] };
  const formulas = await readTabGrid(account, token, 'FORMULA', fetchImpl);
  const imported = importBaseline([{
    title: 'Forecast Profit & Loss',
    sheetId: 1455407915,
    grid: values.grid,
  }], { spreadsheetId: account.spreadsheetId });
  if (!imported.ok) return { ok: false, configured: true, reason: imported.error, cells: [] };
  if (formulas.ok) markFormulaCells(imported.cells, formulas.grid);
  return {
    ok: true,
    configured: true,
    cells: imported.cells,
    months: [...new Set(imported.cells.map((cell) => cell.month))].sort(),
  };
}

export async function applyLiveRead({ stored = [], live, save, recordRead } = {}) {
  if (!live?.ok) {
    return { cells: stored, sheetRuntime: false, sheetFallback: stored.length > 0, refreshed: false };
  }
  const cells = refreshStoredBaseline(stored, live.cells);
  let refreshed = false;
  if (typeof save === 'function') {
    try {
      await save(cells);
      refreshed = true;
    } catch {
      refreshed = false;
    }
  }
  if (live.ok && typeof recordRead === 'function') {
    await recordRead({
      cellKey: 'forecast-live-read',
      sourceCell: 'service_account',
      lastValue: String(cells.length),
      readAt: new Date().toISOString(),
    });
  }
  return { cells, sheetRuntime: true, sheetFallback: false, refreshed, cellCount: cells.length };
}

export function mergeForecastCells(stored, sheet) {
  const byKey = new Map();
  for (const cell of stored || []) byKey.set(`${cell.label}:${monthKey(cell)}`, cell);
  for (const cell of sheet || []) {
    const key = `${cell.label}:${monthKey(cell)}`;
    const existing = byKey.get(key);
    const known = cell.enteredMinor != null || cell.amountMinor != null || cell.formula === true;
    if (!existing || known) byKey.set(key, existing ? { ...existing, ...cell, provenance: 'forecast_sheet' } : cell);
  }
  return [...byKey.values()];
}
