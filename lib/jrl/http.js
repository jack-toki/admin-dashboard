import { canAccess, readSession } from '../auth.js';
import { createJrlReader, jrlAuthGap } from './reader.js';
import { normaliseEntry } from './finance.js';
import { currentJrlAccess, describeJrlProject, jrlSessionCookie } from './session.js';
import { OWNER_LINK_RISK, ownerLinkEnabled, ownerLinkStore, accessFromOwnerLink, subjectFromAccessToken } from './ownerLink.js';
import { openAppStore } from '../store/index.js';
import { jrlView } from './status.js';

const privateHeaders = { 'cache-control': 'private, no-store' };

function withCookie(body, status, cookie) {
  const headers = { ...privateHeaders };
  if (cookie) headers['set-cookie'] = cookie;
  return Response.json(body, { status, headers });
}

function gate(req) {
  const session = readSession(req);
  if (!session) return { session: null, response: Response.json({ error: 'unauthenticated' }, { status: 401 }) };
  if (!canAccess(session, 'jrl')) return { session, response: Response.json({ error: 'forbidden' }, { status: 403 }) };
  return { session, response: null };
}

function appStore(options) {
  if (options.store) return options.store;
  const opened = openAppStore(options.env);
  return opened.ok ? opened.store : null;
}

async function ledgerAccess(req, options, fetchImpl) {
  if (!ownerLinkEnabled(options.env)) return currentJrlAccess(req, options.env, fetchImpl, options.now);
  const linked = await accessFromOwnerLink({
    store: options.ownerStore || ownerLinkStore(appStore(options)),
    env: options.env,
    fetchImpl,
    now: options.now,
  });
  if (!linked.ok) return { ok: false, expired: Boolean(linked.expired), error: linked.error };
  return { ok: true, accessToken: linked.accessToken, expiresAt: linked.expiresAt, refreshed: false };
}

function ledgerEntry(row) {
  return normaliseEntry({
    period: row?.period,
    tax_in: row?.tax_in,
    savings_in: row?.savings_in,
    hl_in: row?.hl_in,
    savings_out: row?.savings_out,
    hl_value: row?.hl_value,
    source: 'monthly_finance',
  });
}

export async function jrlGet(req, options = {}) {
  const session = readSession(req, options.env);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401, headers: privateHeaders });
  const result = jrlView(session, options.env);
  if (result.status !== 200) return Response.json(result.body, { status: result.status, headers: privateHeaders });
  const fetchImpl = options.fetchImpl || fetch;
  const access = await ledgerAccess(req, options, fetchImpl);
  const cookie = !ownerLinkEnabled(options.env) && access.refreshed && access.sealed ? jrlSessionCookie(access.sealed, options.env) : '';
  if (!access.ok) {
    return withCookie({
      ...result.body,
      entries: [],
      balances: null,
      auth: {
        ...result.body.auth,
        supabaseUser: false,
        expired: Boolean(access.expired),
        ownerLink: ownerLinkEnabled(options.env),
        ownerLinkRisk: ownerLinkEnabled(options.env) ? OWNER_LINK_RISK : undefined,
      },
    }, 200, cookie);
  }
  const project = describeJrlProject(options.env);
  const reader = createJrlReader({
    url: project.origin,
    anonKey: project.anonKey,
    accessToken: access.accessToken,
    fetchImpl,
  });
  const read = reader.ok ? await reader.select('monthly_finance') : { ok: false, error: 'supabase_user_required', rows: [] };
  const entries = read.ok ? (read.rows || []).map(ledgerEntry) : [];
  return withCookie({
    ...result.body,
    entries,
    balances: null,
    auth: {
      ...result.body.auth,
      supabaseUser: true,
      subject: subjectFromAccessToken(access.accessToken)?.sub || null,
      expiresAt: access.expiresAt,
      expired: false,
      serviceRoleUsed: false,
      read: read.ok ? 'ok' : read.error,
      ownerLink: ownerLinkEnabled(options.env),
      ownerLinkRisk: ownerLinkEnabled(options.env) ? OWNER_LINK_RISK : undefined,
    },
  }, 200, cookie);
}

export async function jrlWrite(req, options = {}) {
  const checked = gate(req);
  if (checked.response) return checked.response;
  const gap = jrlAuthGap(options.env);
  const fetchImpl = options.fetchImpl || fetch;
  const access = await ledgerAccess(req, options, fetchImpl);
  if (!access.ok) {
    return Response.json({
      ok: false,
      error: 'supabase_user_required',
      saved: false,
      serviceRoleUsed: false,
      expired: Boolean(access.expired),
      ...gap,
    }, { status: 409, headers: privateHeaders });
  }
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const entry = normaliseEntry(body);
  if (!/^\d{4}-\d{2}-01$/.test(entry.period)) {
    return Response.json({ ok: false, error: 'invalid_period', saved: false, serviceRoleUsed: false }, { status: 400, headers: privateHeaders });
  }
  const project = describeJrlProject(options.env);
  const response = await fetchImpl(`${project.origin}/rest/v1/monthly_entry?on_conflict=period`, {
    method: 'POST',
    headers: {
      apikey: project.anonKey,
      Authorization: `Bearer ${access.accessToken}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      period: entry.period,
      tax_in: entry.tax_in,
      savings_in: entry.savings_in,
      hl_in: entry.hl_in,
      savings_out: entry.savings_out,
      hl_portfolio_value: entry.hl_value,
      source: 'dashboard',
    }),
  });
  if (!response.ok) {
    return Response.json({ ok: false, error: 'rls_or_session_rejected', saved: false, serviceRoleUsed: false }, { status: 409, headers: privateHeaders });
  }
  return Response.json({ ok: true, saved: true, serviceRoleUsed: false, balances: null }, { status: 200, headers: privateHeaders });
}
