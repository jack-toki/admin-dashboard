// JRL ledger reads use the anon key and the signed-in user's access token.
// The cockpit password is not that session. The service role is refused.
// A legacy anon JWT (role=anon) is accepted. A publishable key is not required.

import { jrlPublicConfig } from './session.js';

export const JRL_HANDOFF = '/cockpit/jrl/login?return=/cockpit%23jrl';

export function jrlAuthGap(env = process.env) {
  const config = jrlPublicConfig(env);
  return {
    cockpitSession: 'password',
    supabaseUser: false,
    serviceRoleUsed: false,
    configured: config.configured,
    missing: config.missing,
    keyFormat: config.keyFormat,
    keyAccepted: config.keyAccepted,
    publishableKeyRequired: false,
    projectRefMatches: config.projectRefMatches,
    expectedRef: config.expectedRef,
    handoff: JRL_HANDOFF,
    balances: null,
    note: config.configured
      ? 'The cockpit password does not open the ledger. Sign in with the JRL account. The legacy anon JWT is accepted, and the service role is not used.'
      : 'Personal balances stay empty until JRL_SUPABASE_URL and JRL_SUPABASE_ANON_KEY are set and you sign in with the JRL account.',
  };
}

export function createJrlReader(options = {}) {
  if (options.serviceRole || options.serviceRoleKey || options.useServiceRole) {
    throw new Error('jrl_service_role_refused');
  }
  const url = options.url || '';
  const anonKey = options.anonKey || '';
  const accessToken = options.accessToken || '';
  if (!url || !anonKey || !accessToken) {
    return { ok: false, error: 'supabase_user_required', balances: null };
  }
  const fetchImpl = options.fetchImpl;
  if (typeof fetchImpl !== 'function') {
    return { ok: false, error: 'reader_not_configured', balances: null };
  }
  return {
    ok: true,
    serviceRoleUsed: false,
    async select(table) {
      const response = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/${table}?select=*`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });
      if (!response.ok) return { ok: false, error: 'rls_or_session_rejected', balances: null, rows: [] };
      const rows = await response.json();
      return { ok: true, rows };
    },
  };
}
