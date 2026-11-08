// Local comparison only. This module never opens a client and never returns a URL or key.

export const EXPECTED_PROJECT_REF = 'hcjybjpimqzsueyslxvl';
export const EXPECTED_PROJECT_URL = 'https://hcjybjpimqzsueyslxvl.supabase.co';
export const EXPECTED_SNAPSHOT_HASH = 'd6ef94188f453fab499cf4740885d2f7086fd6a74b2b3e8021cc8359c70f01a7';

// PostgREST serves only schemas listed in the Data API "Exposed schemas" setting.
// supabase-js .schema('cockpit') sends Accept-Profile / Content-Profile. Until cockpit
// is on that list, the API answers PGRST106 and the table is not reachable.
// There is no supported connector call that changes the setting or reads the service key.
// Do not ALTER ROLE, and do not grant anon or authenticated.
export const COCKPIT_ACCESS = {
  applied: false,
  connected: false,
  schema: 'cockpit',
  schemaRoute: 'postgrest-exposed-schema',
  reachable: false,
  docs: 'https://supabase.com/docs/guides/api/using-custom-schemas',
  postgrest: 'https://docs.postgrest.org/en/stable/references/api/schemas.html',
  exposureError: 'PGRST106',
  parentSetting: 'Project Settings, API, Exposed schemas. Add cockpit and keep every schema already listed.',
  sqlFile: 'supabase/cockpit_forecast.sql',
  grants: 'service_role select, insert, update only',
  doNot: [
    'ALTER ROLE',
    'GRANT to anon or authenticated',
    'treat a publishable key as the server key',
    'change public.runs',
  ],
};

export function projectRefFromUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) return null;
  if (parsed.pathname !== '/' && parsed.pathname !== '') return null;
  const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(parsed.hostname);
  return match ? match[1] : null;
}

export function serviceKeyClaims(key) {
  if (typeof key !== 'string') return null;
  const parts = key.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { return null; }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (payload.role !== 'service_role') return null;
  if (typeof payload.ref !== 'string' || !/^[a-z0-9]{20}$/.test(payload.ref)) return null;
  return { role: 'service_role' };
}

export function targetCheck(env = {}) {
  const urlRef = projectRefFromUrl(env.SUPABASE_URL || '');
  const claims = serviceKeyClaims(env.SUPABASE_SERVICE_KEY || '');
  const keyNamesExpected = claims != null && urlRef === EXPECTED_PROJECT_REF && serviceKeyRef(env.SUPABASE_SERVICE_KEY) === EXPECTED_PROJECT_REF;
  let reason = 'match';
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) reason = 'not_configured';
  else if (!urlRef || !claims) reason = 'unreadable';
  else if (!keyNamesExpected) reason = 'project_ref_mismatch';
  const match = reason === 'match';
  return {
    expectedRef: EXPECTED_PROJECT_REF,
    match,
    reason,
    schemaFlag: env.COCKPIT_DB_SCHEMA === 'cockpit',
    exposedSchema: 'unverified',
    importGateOpen: match && env.COCKPIT_DB_SCHEMA === 'cockpit',
    writesAllowed: match && env.COCKPIT_DB_SCHEMA === 'cockpit',
  };
}

export function classifySchemaProbe(status, code) {
  if (code === 'PGRST106' || status === 406) return { schemaExposed: false, reachable: false, code: 'PGRST106' };
  if (code === 'PGRST205') return { schemaExposed: true, reachable: false, code: 'PGRST205' };
  if (status === 200 || status === 206) return { schemaExposed: true, reachable: true, code: null };
  if (status === 401 || status === 403) return { schemaExposed: true, reachable: false, code: 'permission_denied' };
  return { schemaExposed: false, reachable: false, code: 'probe_failed' };
}

export async function probeCockpitSchema(env = {}, fetchImpl = globalThis.fetch) {
  const target = targetCheck(env);
  if (!target.match) return { probed: false, schemaExposed: false, reachable: false, code: null };
  let response;
  try {
    response = await fetchImpl(`${EXPECTED_PROJECT_URL}/rest/v1/forecast_baseline_cells?select=id&limit=0`, {
      method: 'GET',
      redirect: 'error',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Accept-Profile': 'cockpit',
        Accept: 'application/json',
        Prefer: 'count=exact',
      },
    });
  } catch {
    return { probed: true, schemaExposed: false, reachable: false, code: 'probe_failed' };
  }
  let code = null;
  if (!response.ok) {
    try {
      const body = await response.json();
      code = typeof body?.code === 'string' && /^PGRST\d+$/.test(body.code) ? body.code : null;
    } catch { code = null; }
  }
  return { probed: true, ...classifySchemaProbe(response.status, code) };
}

function serviceKeyRef(key) {
  const parts = String(key).split('.');
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.ref;
  } catch { return null; }
}
