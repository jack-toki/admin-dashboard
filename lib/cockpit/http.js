import { canAccess, readSession } from '../auth.js';
import { validateEntry } from '../planning/entries.js';
import { blankPotRecord, normalisePotRecord } from '../jrl/pots.js';
import { presentDetails, validateIncomeDetail } from '../planning/incomeDetail.js';
import { loadIncomeSource } from '../planning/incomeSource.js';
import { openAppStore } from '../store/index.js';
import { cockpitWorkspace, boardExport } from '../workspace/cockpit.js';
import { jrlView } from '../jrl/status.js';
import { validateRegistration } from '../automations/registry.js';
import { validateEvent } from '../automations/events.js';
import { ZAPIER_ONBOARDING } from '../automations/coverage.js';
import { minimalEvent, READINESS, readinessFor, resolveTenant } from '../automations/onboarding.js';

function denied(session, area) {
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  if (!canAccess(session, area)) return Response.json({ error: 'forbidden' }, { status: 403 });
  return null;
}

function unavailable(opened) {
  if (opened.ok) return null;
  return Response.json({
    ok: false,
    error: 'store_not_configured',
    missing: opened.status.missing,
    durable: false,
  }, { status: 503 });
}

export async function workspaceGet(req, deps = {}) {
  const session = (deps.readSession || readSession)(req, deps.env || process.env);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401, headers: { 'cache-control': 'private, no-store' } });
  if (!canAccess(session, 'toki') && !canAccess(session, 'automations')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = cockpitWorkspace(deps.env || process.env, session);
  if (!canAccess(session, 'toki')) {
    body.xero = { state: 'hidden' };
    body.sheets = { state: 'hidden' };
    body.clickup = { state: 'hidden' };
  }
  const exported = boardExport(body);
  if (!exported.ok) return Response.json({ error: exported.error }, { status: 500 });
  return Response.json(exported.body, { headers: { 'cache-control': 'private, no-store' } });
}

export async function jrlGet(req, deps = {}) {
  const session = (deps.readSession || readSession)(req, deps.env || process.env);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const result = jrlView(session);
  return Response.json(result.body, { status: result.status, headers: { 'cache-control': 'private, no-store' } });
}

export async function planGet(req, deps = {}) {
  const session = (deps.readSession || readSession)(req, deps.env || process.env);
  const block = denied(session, 'toki');
  if (block) return block;
  const opened = (deps.openAppStore || openAppStore)(deps.env || process.env);
  const closed = unavailable(opened);
  if (closed) return closed;
  const entries = await opened.store.listPlans();
  return Response.json({
    ok: true,
    backend: opened.status.backend,
    shared: opened.status.shared === true,
    entries,
  }, { headers: { 'cache-control': 'private, no-store' } });
}

export async function planPost(req, deps = {}) {
  const session = (deps.readSession || readSession)(req, deps.env || process.env);
  const block = denied(session, 'toki');
  if (block) return block;
  const opened = (deps.openAppStore || openAppStore)(deps.env || process.env);
  const closed = unavailable(opened);
  if (closed) return closed;
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const pounds = Number(body.amount);
  const result = validateEntry({
    ...body,
    amountMinor: Number.isFinite(pounds) ? Math.round(pounds * 100) : body.amountMinor,
  });
  if (!result.ok) return Response.json({ ok: false, errors: result.errors }, { status: 400 });
  result.entry.provenance = body.provenance === 'scenario' ? 'scenario' : 'manual_plan';
  const saved = await opened.store.savePlan(result.entry);
  return Response.json({ ok: true, shared: opened.status.shared === true, backend: opened.status.backend, entry: saved }, { status: 201 });
}

export async function planPatch(req, deps = {}) {
  const session = (deps.readSession || readSession)(req, deps.env || process.env);
  const block = denied(session, 'toki');
  if (block) return block;
  const opened = (deps.openAppStore || openAppStore)(deps.env || process.env);
  const closed = unavailable(opened);
  if (closed) return closed;
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  if (!body.id) return Response.json({ ok: false, error: 'id_required' }, { status: 400 });
  const existing = (await opened.store.listPlans()).find((entry) => entry.id === body.id);
  if (!existing) return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  const pounds = body.amount == null ? null : Number(body.amount);
  const result = validateEntry({
    ...existing,
    ...body,
    id: existing.id,
    amountMinor: Number.isFinite(pounds) ? Math.round(pounds * 100) : body.amountMinor ?? existing.amountMinor,
  });
  if (!result.ok) return Response.json({ ok: false, errors: result.errors }, { status: 400 });
  result.entry.provenance = 'manual_plan';
  const saved = await opened.store.savePlan(result.entry);
  return Response.json({ ok: true, entry: saved }, { headers: { 'cache-control': 'private, no-store' } });
}

export async function planDelete(req, deps = {}) {
  const session = (deps.readSession || readSession)(req, deps.env || process.env);
  const block = denied(session, 'toki');
  if (block) return block;
  const opened = (deps.openAppStore || openAppStore)(deps.env || process.env);
  const closed = unavailable(opened);
  if (closed) return closed;
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  if (!body.id) return Response.json({ ok: false, error: 'id_required' }, { status: 400 });
  const result = await opened.store.deletePlan(body.id);
  if (!result.deleted) return Response.json({ ok: false, error: 'not_found', id: body.id }, { status: 404 });
  return Response.json({ ok: true, deleted: true, id: body.id }, { headers: { 'cache-control': 'private, no-store' } });
}

export async function potGet(req, deps = {}) {
  const session = (deps.readSession || readSession)(req, deps.env || process.env);
  const block = denied(session, 'jrl');
  if (block) return block;
  const opened = (deps.openAppStore || openAppStore)(deps.env || process.env);
  const closed = unavailable(opened);
  if (closed) return closed;
  if (typeof opened.store.readPotRecord !== 'function') {
    return Response.json({ ok: true, stored: false, error: 'pot_store_not_ready', record: blankPotRecord() }, { headers: { 'cache-control': 'private, no-store' } });
  }
  const saved = await opened.store.readPotRecord();
  if (saved?.error === 'pot_store_not_ready') {
    return Response.json({ ok: true, stored: false, error: 'pot_store_not_ready', record: blankPotRecord() }, { headers: { 'cache-control': 'private, no-store' } });
  }
  const record = saved ? { ...blankPotRecord(), ...saved } : blankPotRecord();
  return Response.json({ ok: true, stored: true, record }, { headers: { 'cache-control': 'private, no-store' } });
}

export async function potPut(req, deps = {}) {
  const session = (deps.readSession || readSession)(req, deps.env || process.env);
  const block = denied(session, 'jrl');
  if (block) return block;
  const opened = (deps.openAppStore || openAppStore)(deps.env || process.env);
  const closed = unavailable(opened);
  if (closed) return closed;
  if (typeof opened.store.savePotRecord !== 'function') {
    return Response.json({ ok: false, error: 'pot_store_not_ready', stored: false }, { status: 409, headers: { 'cache-control': 'private, no-store' } });
  }
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const result = normalisePotRecord(body);
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: 400 });
  const saved = await opened.store.savePotRecord(result.record);
  if (saved?.error === 'pot_store_not_ready') {
    return Response.json({ ok: false, error: 'pot_store_not_ready', stored: false }, { status: 409, headers: { 'cache-control': 'private, no-store' } });
  }
  return Response.json({ ok: true, stored: true, record: saved }, { headers: { 'cache-control': 'private, no-store' } });
}

function detailGap(result) {
  return Boolean(result && !Array.isArray(result) && result.error === 'income_detail_schema_required');
}

export async function incomeDetailGet(req, deps = {}) {
  const session = (deps.readSession || readSession)(req, deps.env || process.env);
  const block = denied(session, 'toki');
  if (block) return block;
  const opened = (deps.openAppStore || openAppStore)(deps.env || process.env);
  const closed = unavailable(opened);
  if (closed) return closed;
  if (typeof opened.store.listIncomeDetails !== 'function') {
    return Response.json({ ok: true, stored: false, error: 'income_detail_schema_required', records: [] }, { headers: { 'cache-control': 'private, no-store' } });
  }
  const records = await opened.store.listIncomeDetails();
  if (detailGap(records)) {
    return Response.json({ ok: true, stored: false, error: 'income_detail_schema_required', records: [] }, { headers: { 'cache-control': 'private, no-store' } });
  }
  const source = loadIncomeSource(deps.env || process.env);
  const visible = presentDetails(records, source.records);
  return Response.json({
    ok: true,
    stored: true,
    records: visible,
    source: { ok: source.ok, error: source.error || null, count: source.records.length },
  }, { headers: { 'cache-control': 'private, no-store' } });
}

export async function incomeDetailPost(req, deps = {}) {
  const session = (deps.readSession || readSession)(req, deps.env || process.env);
  const block = denied(session, 'toki');
  if (block) return block;
  const opened = (deps.openAppStore || openAppStore)(deps.env || process.env);
  const closed = unavailable(opened);
  if (closed) return closed;
  if (typeof opened.store.saveIncomeDetail !== 'function') {
    return Response.json({ ok: false, stored: false, error: 'income_detail_schema_required' }, { status: 409, headers: { 'cache-control': 'private, no-store' } });
  }
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const pounds = body.amount == null || body.amount === '' ? null : Number(body.amount);
  const result = validateIncomeDetail({
    ...body,
    amountMinor: pounds == null ? null : Math.round(pounds * 100),
  });
  if (!result.ok) return Response.json({ ok: false, errors: result.errors }, { status: 400 });
  const saved = await opened.store.saveIncomeDetail(result.record);
  if (detailGap(saved)) {
    return Response.json({ ok: false, stored: false, error: 'income_detail_schema_required' }, { status: 409, headers: { 'cache-control': 'private, no-store' } });
  }
  const plans = await opened.store.listPlans();
  return Response.json({ ok: true, stored: true, record: saved, planCount: plans.length }, { status: 201, headers: { 'cache-control': 'private, no-store' } });
}

export async function incomeDetailDelete(req, deps = {}) {
  const session = (deps.readSession || readSession)(req, deps.env || process.env);
  const block = denied(session, 'toki');
  if (block) return block;
  const opened = (deps.openAppStore || openAppStore)(deps.env || process.env);
  const closed = unavailable(opened);
  if (closed) return closed;
  if (typeof opened.store.deleteIncomeDetail !== 'function') {
    return Response.json({ ok: false, stored: false, error: 'income_detail_schema_required' }, { status: 409, headers: { 'cache-control': 'private, no-store' } });
  }
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const listed = await opened.store.listIncomeDetails();
  if (detailGap(listed)) {
    return Response.json({ ok: false, stored: false, error: 'income_detail_schema_required' }, { status: 409, headers: { 'cache-control': 'private, no-store' } });
  }
  const existing = listed.find((row) => row.id === body.id);
  if (!existing) return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  if (opened.store.shared || existing.sourceRowId) {
    const removed = existing.sourceRowId
      ? await opened.store.saveIncomeDetail({ ...existing, deletedAt: new Date().toISOString() })
      : await opened.store.deleteIncomeDetail(body.id);
    if (detailGap(removed)) {
      return Response.json({ ok: false, stored: false, error: 'income_detail_schema_required' }, { status: 409, headers: { 'cache-control': 'private, no-store' } });
    }
    return Response.json({ ok: true, deleted: true, tombstone: true, id: body.id }, { headers: { 'cache-control': 'private, no-store' } });
  }
  const result = await opened.store.deleteIncomeDetail(body.id);
  if (!result.deleted) return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  return Response.json({ ok: true, deleted: true, id: body.id }, { headers: { 'cache-control': 'private, no-store' } });
}

export async function registerPost(req, deps = {}) {
  const session = (deps.readSession || readSession)(req, deps.env || process.env);
  const secret = req.headers.get('x-toki-secret') || '';
  const env = deps.env || process.env;
  const secretOk = Boolean(env.INGEST_SECRET) && secret === env.INGEST_SECRET;
  if (!session && !secretOk) return Response.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  const opened = (deps.openAppStore || openAppStore)(env);
  if (!opened.ok) {
    return Response.json({ ok: false, error: 'store_not_configured', missing: opened.status.missing, durable: false, zapier: ZAPIER_ONBOARDING }, { status: 503 });
  }
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const valid = validateRegistration(body);
  if (!valid.ok) return Response.json({ ok: false, errors: valid.errors }, { status: 400 });
  const result = await opened.store.upsertWorkflow({
    accountSlug: String(body.accountSlug).trim(),
    zapId: String(body.zapId).trim(),
    title: String(body.title).trim(),
    accountName: body.accountName || null,
    client: body.client || null,
    owner: body.owner || null,
    zapierListener: false,
  });
  return Response.json({
    ok: true,
    created: result.created,
    durable: true,
    shared: opened.status.shared === true,
    backend: opened.status.backend,
    automatic: false,
    readiness: readinessFor(result.record, []),
    zapier: ZAPIER_ONBOARDING,
  });
}

export async function eventsPost(req, deps = {}) {
  const session = (deps.readSession || readSession)(req, deps.env || process.env);
  const env = deps.env || process.env;
  const secret = req.headers.get('x-toki-secret') || '';
  const allowed = (env.INGEST_SECRET && secret === env.INGEST_SECRET) || Boolean(session);
  if (!allowed) return Response.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  const opened = (deps.openAppStore || openAppStore)(env);
  if (!opened.ok) {
    return Response.json({ ok: false, error: 'store_not_configured', missing: opened.status.missing, durable: false }, { status: 503 });
  }
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const valid = validateEvent(body);
  if (!valid.ok) return Response.json({ ok: false, errors: valid.errors }, { status: 400 });
  const matches = await opened.store.workflowsForZap(String(body.zapId).trim());
  const tenant = resolveTenant(matches, body.accountSlug);
  if (!tenant.ok) {
    return Response.json({ ok: false, error: tenant.error, automatic: false, zapier: ZAPIER_ONBOARDING }, { status: 409 });
  }
  const event = minimalEvent(body, tenant.accountSlug);
  const result = await opened.store.insertEvent(event);
  return Response.json({
    ok: true,
    deduped: result.deduped,
    durable: true,
    shared: opened.status.shared === true,
    backend: opened.status.backend,
    uniqueRunKnown: Boolean(event.runId),
    accountSlug: event.accountSlug,
    readiness: READINESS.receiving,
  });
}
