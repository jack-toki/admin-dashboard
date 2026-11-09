import { importBaseline, sourceHash } from './import.js';
import { isMetricLabel } from './sheetSync.js';

const EXTRA_INPUT_ROWS = new Set([37, 47]);
const EXTRA_INPUT_LABELS = new Set(['jack salary', 'target']);
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

function a1Index(sourceCell) {
  const match = String(sourceCell || '').match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return null;
  let col = 0;
  for (const char of match[1].toUpperCase()) col = (col * 26) + (char.charCodeAt(0) - 64);
  return { row: Number(match[2]) - 1, col: col - 1 };
}

export function sheetUserEntered(raw) {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'object') {
    if (raw.numberValue != null && String(raw.numberValue) !== '') return { numberValue: String(raw.numberValue) };
    if (raw.stringValue != null && String(raw.stringValue) !== '') return sheetUserEntered(raw.stringValue);
    return undefined;
  }
  const text = String(raw).trim();
  if (!text || text.startsWith('=')) return undefined;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return { numberValue: text };
  return { stringValue: text };
}

function sameUserEntered(left, right) {
  const a = sheetUserEntered(left);
  const b = sheetUserEntered(right);
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.numberValue != null || b.numberValue != null) return a.numberValue === b.numberValue;
  return a.stringValue === b.stringValue;
}

function sameMinor(left, right) {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return Number(left) === Number(right);
}

export function attachSheetText(cells, formatted, entered) {
  for (const cell of cells || []) {
    const pos = a1Index(cell.sourceCell);
    if (!pos) continue;
    const display = formatted?.[pos.row]?.[pos.col];
    const raw = entered?.[pos.row]?.[pos.col];
    if (display != null && String(display) !== '' && !String(display).startsWith('=')) cell.displayed = String(display);
    const userEntered = sheetUserEntered(raw);
    if (userEntered) cell.userEntered = userEntered;
  }
  return cells;
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

function extraInput(cell) {
  const label = String(cell?.label || '').trim().toLowerCase();
  const row = Number(cell?.rowNumber ?? cell?.sourceRow);
  return EXTRA_INPUT_LABELS.has(label) || EXTRA_INPUT_ROWS.has(row);
}

export function isCacheInput(cell) {
  const label = String(cell?.label || '').trim();
  if (!label || /^(20\d{2})$/.test(label)) return false;
  const extra = extraInput(cell);
  if (!extra && (cell?.formula === true || isMetricLabel(label))) return false;
  if (!extra && cell?.kind && !['revenue', 'cost', 'sale'].includes(cell.kind)) return false;
  if (!/^\d{4}-\d{2}$/.test(monthKey(cell))) return false;
  return Boolean(cell?.sourceCell || cell?.source_cell);
}

function storedCellState(cell) {
  if (cell.cellState === 'blank' || cell.cellState === 'zero' || cell.cellState === 'value') return cell.cellState;
  if (cell.enteredMinor == null) return 'blank';
  if (cell.enteredMinor === 0) return 'zero';
  return 'value';
}

export function baselineSourceHash(cell) {
  const period = String(cell.period || `${monthKey(cell)}-01`).slice(0, 10);
  const cellState = storedCellState(cell);
  return sourceHash({
    workbookRef: String(cell.spreadsheetId || cell.workbookRef || ''),
    tabRef: String(cell.sheetId ?? ''),
    cellRef: String(cell.sourceCell || cell.source_cell || ''),
    period,
    label: cell.label,
    nullState: cellState,
    enteredMinor: cell.enteredMinor,
  });
}

function hashedCell(cell) {
  return { ...cell, cellState: storedCellState(cell), sourceHash: baselineSourceHash(cell) };
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
    const cellState = blank ? 'blank' : zero ? 'zero' : 'value';
    if (sameMinor(entered, cell.enteredMinor) && storedCellState(cell) === cellState) return cell;
    const updated = {
      ...cell,
      enteredMinor: entered,
      amountMinor: entered,
      effectiveMinor: entered,
      cellState,
      nullState: blank ? 'blank' : zero ? 'zero' : 'amount',
      provenance: 'forecast_sheet',
    };
    const userEntered = sheetUserEntered(next.userEntered);
    if (userEntered && !sameUserEntered(userEntered, cell.userEntered)) updated.userEntered = userEntered;
    if (next.displayed != null && String(next.displayed) !== '' && !String(next.displayed).startsWith('=') && String(next.displayed) !== String(cell.displayed ?? '')) {
      updated.displayed = String(next.displayed);
    }
    return hashedCell(updated);
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
  const formatted = await readTabGrid(account, token, 'FORMATTED_VALUE', fetchImpl);
  const imported = importBaseline([{
    title: 'Forecast Profit & Loss',
    sheetId: 1455407915,
    grid: values.grid,
  }], { spreadsheetId: account.spreadsheetId });
  if (!imported.ok) return { ok: false, configured: true, reason: imported.error, cells: [] };
  if (formulas.ok) markFormulaCells(imported.cells, formulas.grid);
  if (formatted.ok || formulas.ok) attachSheetText(imported.cells, formatted.grid, formulas.grid);
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
    try {
      await recordRead({
        cellKey: 'forecast-live-read',
        sourceCell: 'service_account',
        lastValue: String(cells.length),
        readAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('forecast live read was not recorded', error instanceof Error ? error.message : 'record_failed');
    }
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
