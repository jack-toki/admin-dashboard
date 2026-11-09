import { importBaseline } from './import.js';
import { DELETION_AUDIT } from './model.js';

// The profiles workbook behind SHEET_CSV_URL is the public dashboard, not this forecast.
// A live forecast read uses FORECAST_SHEET_CSV_URL only. Stored cells remain the fallback.

export function forecastSheetConfigured(env = process.env) {
  return Boolean(env.FORECAST_SHEET_CSV_URL);
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
  if (!forecastSheetConfigured(env)) return { ok: false, configured: false, reason: 'not_configured', cells: [] };
  const url = env.FORECAST_SHEET_CSV_URL;
  let response;
  try {
    response = await fetchImpl(url);
  } catch {
    return { ok: false, configured: true, reason: 'sheet_unreachable', cells: [] };
  }
  if (!response?.ok) return { ok: false, configured: true, reason: 'sheet_unreachable', cells: [] };
  const grid = parseCsv(await response.text());
  const imported = importBaseline([{
    title: 'Forecast Profit & Loss',
    sheetId: 1455407915,
    grid,
  }], { spreadsheetId: env.FORECAST_SPREADSHEET_ID || DELETION_AUDIT.forecastWorkbook.id });
  if (!imported.ok) return { ok: false, configured: true, reason: imported.error, cells: [] };
  return { ok: true, configured: true, cells: imported.cells, months: [...new Set(imported.cells.map((cell) => cell.month))].sort() };
}

export function mergeForecastCells(stored, sheet) {
  const byKey = new Map();
  for (const cell of stored || []) byKey.set(`${cell.label}:${cell.month}`, cell);
  for (const cell of sheet || []) {
    const key = `${cell.label}:${cell.month}`;
    const existing = byKey.get(key);
    const known = cell.enteredMinor != null || cell.amountMinor != null;
    if (!existing || known) byKey.set(key, existing ? { ...existing, ...cell, provenance: 'forecast_sheet' } : cell);
  }
  return [...byKey.values()];
}
