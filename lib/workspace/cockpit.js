import { COVERAGE_SNAPSHOT, INGEST_ALIAS_HOST, PROFILES_SHEET, ZAPIER_ONBOARDING } from '../automations/coverage.js';
import { codeAssumptions } from '../automations/value.js';
import { jrlStatus } from '../jrl/status.js';
import { clickupStatus, sheetsStatus } from '../sources/status.js';
import { xeroStatus } from '../xero/oauth.js';

export function cockpitWorkspace(env = process.env, session) {
  return {
    area: 'cockpit',
    role: session?.role || null,
    client: session?.client || null,
    jrlIncluded: false,
    publicRoutesPreserved: ['/', '/api/dashboard', '/api/ingest/[account]'],
    ingest: {
      method: 'POST',
      path: '/api/ingest/<account-slug>',
      aliasHost: INGEST_ALIAS_HOST,
      header: 'x-toki-secret',
      secretConfigured: Boolean(env.INGEST_SECRET),
      liveHttpTested: false,
      evidence: 'zap_export_snapshot_not_live_probe',
      accepts: ['application/json', 'application/x-www-form-urlencoded'],
    },
    coverage: COVERAGE_SNAPSHOT,
    profiles: { ...PROFILES_SHEET, fetched: false, join: 'zap id when present, otherwise title with ambiguity warnings' },
    assumptions: codeAssumptions(),
    zapier: ZAPIER_ONBOARDING,
    xero: xeroStatus(env),
    sheets: sheetsStatus(env),
    clickup: clickupStatus(env),
    jrl: session?.areas?.includes('jrl') ? { linked: false } : { linked: false, hidden: true },
  };
}

export function boardExport(toki) {
  const copy = JSON.parse(JSON.stringify(toki || {}));
  delete copy.jrl;
  delete copy.personal;
  const text = JSON.stringify(copy);
  if (/jrl-finance|personal ledger|@"/i.test(text)) {
    return { ok: false, error: 'export_blocked' };
  }
  return { ok: true, body: { ...copy, jrlIncluded: false } };
}
