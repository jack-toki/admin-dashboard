import { db } from '../supabase.js';
import { openFileStore } from './fileStore.js';
import { decryptToken, encryptToken } from '../xero/oauth.js';

export function storeStatus(env = process.env) {
  if (env.APP_STORE === 'memory') {
    return { state: 'not_configured', backend: null, durable: false, missing: ['APP_STORE=supabase'], reason: 'memory_store_refused' };
  }
  if (env.APP_STORE === 'file') {
    if (env.NODE_ENV === 'production') {
      return { state: 'not_configured', backend: null, durable: false, missing: ['APP_STORE=supabase'], reason: 'file_store_refused_in_production' };
    }
    const missing = [];
    if (!env.APP_STORE_PATH) missing.push('APP_STORE_PATH');
    if (!env.APP_TOKEN_ENCRYPTION_KEY && !env.XERO_TOKEN_ENCRYPTION_KEY) missing.push('APP_TOKEN_ENCRYPTION_KEY');
    if (missing.length) return { state: 'not_configured', backend: null, durable: false, missing };
    return { state: 'configured', backend: 'file', durable: true, shared: false };
  }
  if (env.APP_STORE === 'supabase') {
    const missing = [];
    if (!env.SUPABASE_URL) missing.push('SUPABASE_URL');
    if (!env.SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_KEY');
    if (!env.APP_TOKEN_ENCRYPTION_KEY && !env.XERO_TOKEN_ENCRYPTION_KEY) missing.push('APP_TOKEN_ENCRYPTION_KEY');
    if (missing.length) return { state: 'not_configured', backend: null, durable: false, missing };
    return { state: 'configured', backend: 'supabase', durable: true, shared: true };
  }
  return {
    state: 'not_configured',
    backend: null,
    durable: false,
    missing: ['APP_STORE', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'APP_TOKEN_ENCRYPTION_KEY'],
  };
}

function rowToPlan(row) {
  return {
    id: row.id,
    area: 'toki',
    kind: row.kind,
    provenance: row.provenance,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    month: row.month,
    party: row.party,
    groupId: row.group_id,
    timing: row.timing,
    durationMonths: row.duration_months,
    probability: row.probability == null ? null : Number(row.probability),
    stage: row.stage,
    attestation: row.attestation,
    attestationSource: row.attestation_source,
    xeroVerified: row.xero_verified,
    externalRef: row.external_ref,
    matchId: row.match_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function planToRow(entry) {
  return {
    id: entry.id,
    area: 'toki',
    kind: entry.kind,
    provenance: entry.provenance || 'manual_plan',
    amount_minor: entry.amountMinor,
    currency: entry.currency,
    month: entry.month,
    party: entry.party,
    group_id: entry.groupId,
    timing: entry.timing,
    duration_months: entry.durationMonths,
    probability: entry.probability,
    stage: entry.stage,
    attestation: entry.attestation,
    attestation_source: entry.attestationSource || 'manual',
    xero_verified: false,
    external_ref: entry.externalRef,
    match_id: entry.matchId,
    updated_at: new Date().toISOString(),
  };
}

export function openSupabaseStore(env = process.env) {
  const client = () => db();
  return {
    backend: 'supabase',
    shared: true,
    async listPlans() {
      const { data, error } = await client().from('plan_entries').select('*').eq('area', 'toki');
      if (error) throw new Error('store_failed');
      return (data || []).map(rowToPlan);
    },
    async savePlan(entry) {
      const { data, error } = await client().from('plan_entries').upsert(planToRow(entry)).select('*').limit(1);
      if (error) throw new Error('store_failed');
      return rowToPlan(data[0]);
    },
    async upsertWorkflow(record) {
      const row = {
        account_slug: record.accountSlug,
        zap_id: record.zapId,
        title: record.title,
        account_name: record.accountName,
        client_name: record.client,
        owner_name: record.owner,
      };
      const { data, error } = await client().from('automation_registry').upsert(row, { onConflict: 'account_slug,zap_id' }).select('*').limit(1);
      if (error) throw new Error('store_failed');
      return { created: true, record: data[0] };
    },
    async insertEvent(event) {
      const { data: existing, error: readError } = await client().from('automation_events').select('event_id').eq('event_id', event.eventId).limit(1);
      if (readError) throw new Error('store_failed');
      if (existing?.length) return { deduped: true, event };
      const { error } = await client().from('automation_events').insert({
        event_id: event.eventId,
        account_slug: event.accountSlug,
        zap_id: event.zapId,
        run_id: event.runId,
        stage_id: event.stageId,
        attempt: event.attempt,
        status: event.status,
        occurred_at: event.occurredAt,
      });
      if (error) throw new Error('store_failed');
      return { deduped: false, event };
    },
    async saveToken({ provider, tenantKey, payload }) {
      const enc = encryptToken(payload, env);
      if (!enc.ok) throw new Error(enc.error);
      const { error } = await client().from('app_oauth_tokens').upsert({
        provider,
        tenant_key: tenantKey,
        ciphertext: enc.ciphertext,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider,tenant_key' });
      if (error) throw new Error('store_failed');
      return { ok: true };
    },
    async consumeNonce(nonce) {
      const { data, error } = await client().from('login_attempts').select('id').eq('subject', `nonce:${nonce}`).limit(1);
      if (error) throw new Error('store_failed');
      if (data?.length) return false;
      const { error: insertError } = await client().from('login_attempts').insert({ subject: `nonce:${nonce}` });
      if (insertError) throw new Error('store_failed');
      return true;
    },
    async addFailure(subject, at) {
      const { error } = await client().from('login_attempts').insert({ subject, failed_at: new Date(at).toISOString() });
      if (error) throw new Error('store_failed');
    },
    async failures(subject, since) {
      const { data, error } = await client().from('login_attempts').select('failed_at').eq('subject', subject).gte('failed_at', new Date(since).toISOString());
      if (error) throw new Error('store_failed');
      return (data || []).map((row) => ({ subject, at: Date.parse(row.failed_at) }));
    },
  };
}

export function openAppStore(env = process.env) {
  const status = storeStatus(env);
  if (status.state !== 'configured') return { ok: false, status };
  if (status.backend === 'file') return { ok: true, status, store: openFileStore(env.APP_STORE_PATH, env) };
  return { ok: true, status, store: openSupabaseStore(env) };
}

export function assertCiphertext(value) {
  return typeof value === 'string' && !value.includes('refresh_token');
}

export { decryptToken };
