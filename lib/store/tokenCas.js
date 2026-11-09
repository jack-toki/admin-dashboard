import { decryptToken, encryptToken } from '../xero/oauth.js';

// One UPDATE ... WHERE generation = expected is the lock.
// A missing generation column or a provider check that rejects jrl fails closed.
// The error returned here is a code. It does not include ciphertext or token text.

export function linkStoreGap(error) {
  if (!error) return false;
  const code = String(error.code || '');
  if (code === '42703' || code === '23514' || code === 'PGRST204') return true;
  const message = String(error.message || '');
  if (/app_oauth_tokens_provider_check/i.test(message)) return true;
  return /generation/i.test(message) && /column|schema cache/i.test(message);
}

function gapOrFailed(error) {
  if (linkStoreGap(error)) return { ok: false, error: 'link_store_not_ready' };
  return { ok: false, error: 'store_failed' };
}

function firstRow(data) {
  if (Array.isArray(data)) return data[0] || null;
  if (data && typeof data === 'object') return data;
  return null;
}

function rowsOf(data) {
  if (Array.isArray(data)) return data;
  return firstRow(data) ? [firstRow(data)] : [];
}

export function normalizeStoredOwner(payload, generation) {
  const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const session = body.session && typeof body.session === 'object' ? body.session : {};
  const user = body.user && typeof body.user === 'object' ? body.user : {};
  const sub = body.sub || body.owner_sub || session.sub || user.id || null;
  const refreshToken = body.refreshToken || body.refresh_token || session.refreshToken || session.refresh_token || null;
  const accessToken = body.accessToken || body.access_token || session.accessToken || session.access_token || null;
  let expiresAt = body.expiresAt ?? body.expires_at ?? session.expiresAt ?? session.expires_at ?? null;
  if (typeof expiresAt === 'string' && /^\d+$/.test(expiresAt)) expiresAt = Number(expiresAt);
  if (typeof expiresAt === 'number' && expiresAt > 0 && expiresAt < 10_000_000_000) expiresAt *= 1000;
  return {
    sub: sub ? String(sub).toLowerCase() : null,
    refreshToken: refreshToken ? String(refreshToken) : null,
    accessToken: accessToken ? String(accessToken) : null,
    expiresAt: expiresAt == null ? null : Number(expiresAt),
    revoked: body.revoked === true || body.phase === 'revoked',
    phase: body.phase || (body.revoked === true ? 'revoked' : 'ready'),
    generation: Number(generation) || 0,
  };
}

function ownerProbe(row, payload, tenantKey, decrypted) {
  const names = payload && typeof payload === 'object'
    ? Object.keys(payload).filter((name) => /^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(name)).sort()
    : [];
  return {
    rowPresent: Boolean(row),
    decrypted: Boolean(decrypted),
    fieldNames: names,
    tenantMatched: Boolean(row) && (row.tenant_key === tenantKey || row.tenantKey === tenantKey),
  };
}

export async function readOauthToken(client, env, { provider, tenantKey }) {
  const filtered = await client.from('app_oauth_tokens').select('*').eq('provider', provider).eq('tenant_key', tenantKey).limit(1);
  if (filtered.error) return { ...gapOrFailed(filtered.error), probe: { rowPresent: false, decrypted: false, fieldNames: [], tenantMatched: false } };
  let row = firstRow(filtered.data);
  if (!row && provider === 'jrl') {
    const broader = await client.from('app_oauth_tokens').select('*').eq('provider', provider).limit(2);
    const rows = broader.error ? [] : rowsOf(broader.data).filter((item) => item?.provider === provider);
    if (rows.length === 1) row = rows[0];
  }
  if (!row) return { ok: true, record: null, probe: ownerProbe(null, null, tenantKey, false) };
  const ciphertext = row.ciphertext;
  const generation = row.generation ?? 0;
  if (ciphertext == null) return { ok: false, error: 'store_unreadable', probe: ownerProbe(row, null, tenantKey, false) };
  if (ciphertext === 'revoked' || ciphertext === '') {
    return {
      ok: true,
      record: { revoked: true, sub: null, refreshToken: null, generation: Number(generation) },
      probe: ownerProbe(row, null, tenantKey, false),
    };
  }
  const decoded = decryptToken(ciphertext, env);
  if (!decoded.ok) return { ok: false, error: 'store_unreadable', probe: ownerProbe(row, null, tenantKey, false) };
  return {
    ok: true,
    record: normalizeStoredOwner(decoded.payload, generation),
    probe: ownerProbe(row, decoded.payload, tenantKey, true),
  };
}

export async function compareAndSwapOauthToken(client, env, { provider, tenantKey, expectedGeneration, payload }) {
  const nextGeneration = Number(expectedGeneration) + 1;
  const revoked = payload?.revoked === true;
  const enc = revoked ? { ok: true, ciphertext: 'revoked' } : encryptToken({ ...payload, generation: nextGeneration }, env);
  if (!enc.ok) return { ok: false, error: 'store_unreadable' };
  const updated = await client
    .from('app_oauth_tokens')
    .update({
      ciphertext: enc.ciphertext,
      generation: nextGeneration,
      updated_at: new Date().toISOString(),
    })
    .eq('provider', provider)
    .eq('tenant_key', tenantKey)
    .eq('generation', expectedGeneration)
    .select('generation');
  if (updated.error) return gapOrFailed(updated.error);
  if (updated.data?.length) return { ok: true, record: { ...payload, generation: nextGeneration } };
  if (Number(expectedGeneration) !== 0) return { ok: false, conflict: true };
  const inserted = await client
    .from('app_oauth_tokens')
    .insert({
      provider,
      tenant_key: tenantKey,
      ciphertext: enc.ciphertext,
      generation: nextGeneration,
      updated_at: new Date().toISOString(),
    })
    .select('generation');
  if (inserted.error) {
    if (String(inserted.error.code || '') === '23505') return { ok: false, conflict: true };
    return gapOrFailed(inserted.error);
  }
  if (!inserted.data?.length) return { ok: false, conflict: true };
  return { ok: true, record: { ...payload, generation: nextGeneration } };
}
