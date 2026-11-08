export async function finishOAuth({ store, nonce, exchange, code, provider }) {
  if (!store || typeof store.consumeNonce !== 'function' || typeof store.saveToken !== 'function') {
    return { status: 503, body: { ok: false, error: 'store_not_configured', durable: false } };
  }
  const fresh = await store.consumeNonce(nonce);
  if (!fresh) return { status: 400, body: { ok: false, error: 'state_reused' } };
  if (typeof exchange !== 'function') {
    return { status: 409, body: { ok: false, error: 'token_exchange_not_run' } };
  }
  const tokens = await exchange(code);
  if (!tokens || tokens.refresh_token == null && tokens.access_token == null) {
    return { status: 502, body: { ok: false, error: 'token_exchange_failed' } };
  }
  await store.saveToken({
    provider,
    tenantKey: tokens.tenantKey || 'pending',
    payload: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    },
  });
  return { status: 200, body: { ok: true, stored: true, provider } };
}
