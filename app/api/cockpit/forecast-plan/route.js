import { canAccess, readSession } from '../../../../lib/auth.js';
import { readPipelinePlan, writePipelineCell } from '../../../../lib/forecast/pipelineRead.js';
import { openAppStore } from '../../../../lib/store/index.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function denied(session) {
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  if (!canAccess(session, 'toki')) return Response.json({ error: 'forbidden' }, { status: 403 });
  return null;
}

export async function GET(req) {
  const block = denied(readSession(req));
  if (block) return block;
  const read = await readPipelinePlan();
  if (!read.ok) {
    return Response.json({ ok: false, configured: read.configured === true, error: read.reason || 'sheet_unreadable', plan: null }, { status: read.configured ? 502 : 503 });
  }
  return Response.json({
    ok: true,
    configured: true,
    tab: read.plan.tab,
    sheetId: read.plan.sheetId,
    range: read.plan.range,
    plan: read.plan,
  });
}

export async function POST(req) {
  const block = denied(readSession(req));
  if (block) return block;
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const read = await readPipelinePlan();
  if (!read.ok) return Response.json({ ok: false, error: read.reason || 'sheet_unreadable' }, { status: read.configured ? 502 : 503 });
  const opened = openAppStore();
  const store = opened.ok ? opened.store : null;
  const result = await writePipelineCell({
    plan: read.plan,
    a1: String(body.a1 || ''),
    minor: body.minor,
    stored: body.stored,
    log: store && typeof store.appendSheetLog === 'function' ? (row) => store.appendSheetLog(row) : null,
  });
  const status = result.status === 'written' ? 200 : result.status === 'conflict' ? 409 : result.status === 'skip' ? 400 : 502;
  return Response.json({ ok: result.status === 'written', ...result, tab: read.plan.tab }, { status });
}
