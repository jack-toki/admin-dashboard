import { canAccess, readSession } from '../../../../lib/auth.js';
import { importBaseline } from '../../../../lib/forecast/import.js';
import { openAppStore } from '../../../../lib/store/index.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function denied(session) {
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  if (!canAccess(session, 'toki')) return Response.json({ error: 'forbidden' }, { status: 403 });
  return null;
}

export async function GET(req) {
  const session = readSession(req);
  const block = denied(session);
  if (block) return block;
  const opened = openAppStore();
  if (!opened.ok) {
    return Response.json({
      ok: false,
      connected: false,
      error: 'store_not_configured',
      cells: [],
      actuals: null,
      sheetRuntime: false,
    }, { status: 503 });
  }
  let cells = [];
  try {
    cells = await opened.store.listBaseline();
  } catch (error) {
    if (error.message === 'schema_unconfirmed') {
      return Response.json({ ok: false, connected: false, error: 'schema_unconfirmed', cells: [], actuals: null, sheetRuntime: false, testedAgainstPreview: false }, { status: 503 });
    }
    throw error;
  }
  return Response.json({
    ok: true,
    connected: false,
    storedCount: cells.length,
    testedAgainstPreview: false,
    cells,
    actuals: null,
    sheetRuntime: false,
    provenance: 'forecast_baseline',
  }, { headers: { 'cache-control': 'private, no-store' } });
}

export async function POST(req) {
  const session = readSession(req);
  const block = denied(session);
  if (block) return block;
  const opened = openAppStore();
  if (!opened.ok) {
    return Response.json({ ok: false, connected: false, error: 'store_not_configured', sheetRuntime: false }, { status: 503 });
  }
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  if (body.confirm !== 'import-forecast-baseline') {
    return Response.json({ ok: false, error: 'confirm_required' }, { status: 400 });
  }
  const imported = importBaseline(body.sheets, { spreadsheetId: body.spreadsheetId });
  if (!imported.ok) return Response.json({ ok: false, ...imported }, { status: 422 });
  const existing = await opened.store.listBaseline();
  const saved = await opened.store.saveBaseline(imported.cells);
  return Response.json({
    ok: true,
    connected: false,
    created: saved.created,
    updated: saved.updated,
    reconciliation: imported.reconciliation,
    anomaly: imported.anomaly,
    grossProfitMeaning: imported.grossProfitMeaning,
    previousCount: existing.length,
    sheetRuntime: false,
    actuals: null,
  }, { status: 201 });
}
