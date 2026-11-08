import { canAccess, readSession } from '../../../../lib/auth.js';
import { importBaseline, importNormalized } from '../../../../lib/forecast/import.js';
import { modelFromStoredCells, DELETION_AUDIT } from '../../../../lib/forecast/model.js';
import { validateAdditionalPacket, evidenceView } from '../../../../lib/forecast/additional.js';
import { openAppStore, supabaseGuard } from '../../../../lib/store/index.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function storeClosed(opened) {
  if (!opened.ok) {
    return Response.json({ ok: false, connected: false, error: 'store_not_configured', cells: [], actuals: null, sheetRuntime: false }, { status: 503 });
  }
  if (opened.status.backend === 'supabase') {
    const guard = supabaseGuard();
    if (!guard.ok) {
      return Response.json({ ok: false, connected: false, error: guard.error, target: guard.target, cells: [], actuals: null, sheetRuntime: false }, { status: 503 });
    }
  }
  return null;
}

function readClosed(error) {
  if (error.message === 'schema_unconfirmed' || error.message === 'target_mismatch' || error.message === 'schema_not_exposed') {
    return Response.json({ ok: false, connected: false, error: error.message, cells: [], actuals: null, sheetRuntime: false }, { status: 503 });
  }
  return null;
}

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
  const closed = storeClosed(opened);
  if (closed) return closed;
  let cells = [];
  let evidence = null;
  try {
    cells = await opened.store.listBaseline();
    const storedEvidence = await opened.store.listEvidence();
    evidence = storedEvidence ? evidenceView(storedEvidence) : null;
  } catch (error) {
    const closedRead = readClosed(error);
    if (closedRead) return closedRead;
    throw error;
  }
  return Response.json({
    ok: true,
    connected: false,
    storedCount: cells.length,
    testedAgainstPreview: false,
    cells,
    model: modelFromStoredCells(cells),
    actuals: evidence?.actuals || null,
    evidence,
    sheetRuntime: false,
    sheetFallback: false,
    workbookRequiredAtRuntime: false,
    allSheetsSafeToDelete: DELETION_AUDIT.allGoogleSheetsSafeToDelete,
    provenance: 'forecast_baseline',
  }, { headers: { 'cache-control': 'private, no-store' } });
}

export async function POST(req) {
  const session = readSession(req);
  const block = denied(session);
  if (block) return block;
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  if (body.confirm === 'import-forecast-evidence') {
    const validated = validateAdditionalPacket(body.packet);
    if (!validated.ok) return Response.json({ ok: false, connected: false, error: validated.error, counts: validated.counts }, { status: 422 });
    const opened = openAppStore();
    const closed = storeClosed(opened);
    if (closed) return closed;
    try {
      await opened.store.saveEvidence(validated.stored);
    } catch (error) {
      const closedRead = readClosed(error);
      if (closedRead) return closedRead;
      throw error;
    }
    return Response.json({ ok: true, connected: false, counts: validated.counts, sheetRuntime: false, sheetFallback: false }, { status: 201 });
  }
  if (body.confirm !== 'import-forecast-baseline') {
    return Response.json({ ok: false, error: 'confirm_required' }, { status: 400 });
  }
  const imported = Array.isArray(body.records)
    ? importNormalized(body.records, { spreadsheetId: body.spreadsheetId, sheetId: body.sheetId, fullSnapshot: true })
    : importBaseline(body.sheets, { spreadsheetId: body.spreadsheetId });
  if (!imported.ok) return Response.json({ ok: false, connected: false, error: imported.error }, { status: 422 });
  const opened = openAppStore();
  const closed = storeClosed(opened);
  if (closed) return closed;
  let existing;
  let saved;
  try {
    existing = await opened.store.listBaseline();
    saved = await opened.store.saveBaseline(imported.cells);
  } catch (error) {
    const closedRead = readClosed(error);
    if (closedRead) return closedRead;
    throw error;
  }
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
