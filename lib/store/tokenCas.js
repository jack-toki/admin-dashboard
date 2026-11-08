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

export async function readOauthToken(client, env, { provider, tenantKey }) {
  const result = await client
    .from('app_oauth_tokens')
    .select('ciphertext, generation')
    .eq('provider', provider)
    .eq('tenant_key', tenantKey)
    .limit(1);
  if (result.error) return gapOrFailed(result.error);
  const row = result.data?.[0];
  if (!row) return { ok: true, record: null };
  if (row.ciphertext === 'revoked' || row.ciphertext === '') {
    return { ok: true, record: { revoked: true, generation: Number(row.generation) } };
  }
  const decoded = decryptToken(row.ciphertext, env);
  if (!decoded.ok) return { ok: false, error: 'store_unreadable' };
  return {
    ok: true,
    record: { ...decoded.payload, generation: Number(row.generation) },
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
