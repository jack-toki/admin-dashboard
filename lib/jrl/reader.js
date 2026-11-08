// JRL ledger reads use the anon key and the signed-in user's access token.
// The cockpit password is not that session. The service role is refused.

export const JRL_HANDOFF = 'https://jrl-finance.vercel.app/login';

export function jrlAuthGap(env = process.env) {
  const url = env.JRL_SUPABASE_URL || '';
  const anon = env.JRL_SUPABASE_ANON_KEY || '';
  const missing = [];
  if (!url) missing.push('JRL_SUPABASE_URL');
  if (!anon) missing.push('JRL_SUPABASE_ANON_KEY');
  return {
    cockpitSession: 'password',
    supabaseUser: false,
    serviceRoleUsed: false,
    configured: missing.length === 0,
    missing,
    handoff: JRL_HANDOFF,
    balances: null,
    note: 'The cockpit password is not a Supabase user. Personal balances stay empty until that separate session exists.',
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
