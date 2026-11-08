import { accountLabel } from '../supabase.js';

// Legacy Zapier steps post three fields. One AA step is form-encoded.
// Harewood still sends the unfilled placeholder {{zap_meta_utc_iso}}.
// These posts have no run id. They must all be kept. Deduping on zap id would drop real runs.

const PLACEHOLDER = /\{\{/;

export function parseLegacyBody(raw, contentType = '') {
  const type = String(contentType || '').toLowerCase();
  if (type.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(String(raw || ''));
    let counts = null;
    const countsRaw = params.get('counts');
    if (countsRaw) {
      try {
        const parsed = JSON.parse(countsRaw);
        if (parsed && typeof parsed === 'object') counts = parsed;
      } catch { counts = null; }
    }
    return {
      zap: params.get('zap'),
      zap_id: params.get('zap_id'),
      zap_title: params.get('zap_title'),
      ts: params.get('ts'),
      counts,
    };
  }
  if (raw && typeof raw === 'object') return raw;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function resolveLegacyTimestamp(raw, now = new Date()) {
  const text = raw == null ? '' : String(raw).trim();
  if (!text || PLACEHOLDER.test(text)) {
    return { iso: now.toISOString(), source: 'received_at', warning: 'timestamp_placeholder' };
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return { iso: now.toISOString(), source: 'received_at', warning: 'timestamp_unparsed' };
  }
  return { iso: date.toISOString(), source: 'payload', warning: null };
}

export function inspectLegacyIdentity(body) {
  const accountId = body?.account_id ? String(body.account_id) : null;
  const runId = body?.run_id ? String(body.run_id) : null;
  return {
    accountId,
    runId,
    dedupe: false,
    savingsClaim: false,
    reason: 'legacy_zap_zap_id_ts_has_no_stable_run_id',
  };
}

export function buildLegacyRow(accountSlug, body, now = new Date()) {
  const ts = resolveLegacyTimestamp(body?.ts, now);
  const counts = body?.counts && typeof body.counts === 'object' ? { ...body.counts } : null;
  return {
    row: {
      account: accountLabel(accountSlug),
      zap_id: body?.zap_id ? String(body.zap_id) : null,
      zap_title: body?.zap || body?.zap_title || null,
      ts: ts.iso,
      counts,
    },
    warning: ts.warning,
    deduped: false,
    identity: inspectLegacyIdentity(body),
  };
}

export async function handleLegacyIngest({ account, secret, configuredSecret, body, db, now }) {
  if (!configuredSecret || secret !== configuredSecret) {
    return { status: 401, body: { ok: false, error: 'bad secret' } };
  }
  const built = buildLegacyRow(account, body || {}, now);
  const { error } = await db.from('runs').insert(built.row);
  if (error) return { status: 500, body: { ok: false, error: 'store_failed' } };
  const response = { ok: true };
  if (built.warning) response.ts_warning = built.warning;
  return { status: 200, body: response, inserted: built.row };
}
