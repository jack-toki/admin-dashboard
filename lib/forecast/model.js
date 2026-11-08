import { classifyLine } from '../groups.js';
import { overview, withScenario } from '../finance/screen.js';

// The forecast workbook is provenance for the stored cells. It is not read here.
// Other workbooks and unimported tabs are listed so the file is not treated as disposable.

export const DELETION_AUDIT = {
  allGoogleSheetsSafeToDelete: false,
  forecastWorkbook: {
    id: '10sGcVQcgKCJfuy7BDLV_UzxIly-vF4aU5tRjmZumGLk',
    tabId: 1455407915,
    importedCellCount: 377,
    cockpitRuntimeSource: false,
    cockpitNeedsWorkbookToOperate: false,
    safeToDelete: false,
    notMigrated: [
      'tabs other than the first Forecast Profit & Loss tab, including V2 amounts',
      'the annual total column, which is not one of the 13 stored periods',
      'accounting actuals, including January to July history and the incomplete August',
      'any figure that was not one of the 377 imported forecast cells',
    ],
  },
  profilesWorkbook: {
    id: '1lgCOYXqiRJSJy9BehqplKvh-QyLU0qWnBt77-av9qLI',
    tab: 'profiles',
    cockpitRuntimeSource: false,
    publicDashboardRuntimeSource: true,
    usedBy: 'GET /api/dashboard when SHEET_CSV_URL is set',
    changedInThisWork: false,
    safeToDelete: false,
  },
};

export function modelFromStoredCells(cells) {
  const rowsByKey = new Map();
  const months = new Set();
  for (const cell of cells || []) {
    if (cell.isActual === true) continue;
    const month = cell.month || String(cell.period || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    months.add(month);
    const classified = classifyLine(cell.label);
      const sourceConfirmed = cell.sourceConfirmed === true || (cell.sourceConfirmed == null && Boolean(cell.groupId));
    const key = `${cell.rowNumber ?? cell.label}:${cell.label}`;
    if (!rowsByKey.has(key)) {
      rowsByKey.set(key, {
        rowNumber: cell.rowNumber ?? null,
        label: cell.label,
        kind: cell.kind || classified.kind,
        group: {
          groupId: sourceConfirmed ? (cell.groupId || classified.groupId) : (cell.groupId || null),
          sourceConfirmed,
          provenance: 'stored_forecast',
        },
        cells: {},
      });
    }
    const minor = cell.enteredMinor ?? cell.amountMinor ?? null;
    const blank = cell.nullState === 'blank' || cell.cellState === 'blank' || minor == null;
    rowsByKey.get(key).cells[month] = { minor: blank ? null : minor, blank };
  }
  return {
    synthetic: false,
    source: 'stored_forecast',
    sheetRuntime: false,
    workbookRequiredAtRuntime: false,
    provenance: {
      workbookId: cells?.[0]?.spreadsheetId || cells?.[0]?.source_workbook_id || null,
      sheetId: cells?.[0]?.sheetId || cells?.[0]?.source_sheet_id || null,
    },
    months: [...months].sort().map((key) => ({ key, header: key })),
    rows: [...rowsByKey.values()],
    grossProfitMeaning: 'Gross Profit here means the billing sum, not profit after costs.',
  };
}

export async function readStoredForecast(store) {
  const cells = await store.listBaseline();
  const model = modelFromStoredCells(cells);
  const month = model.months[0]?.key || null;
  return {
    ok: true,
    connected: false,
    sheetRuntime: false,
    sheetFallback: false,
    workbookRequiredAtRuntime: false,
    cells,
    model,
    recomputed: month ? overview(model, null, month) : null,
    higher: month ? overview({ rows: withScenario(model.rows, 'best') }, null, month) : null,
  };
}
