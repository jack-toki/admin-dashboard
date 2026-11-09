import { db } from '../supabase.js';
import { openFileStore } from './fileStore.js';
import { evidenceFromRows, evidenceToRows } from '../forecast/evidenceRows.js';
import { targetCheck } from './target.js';
import { decryptToken, encryptToken } from '../xero/oauth.js';
import { compareAndSwapOauthToken, readOauthToken } from './tokenCas.js';
import { detailFromRow, detailToRow, potDocument, relationMissing } from './sharedRows.js';
import { outstandingFromRow } from '../planning/outstanding.js';

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

export function supabaseGuard(env = process.env) {
  const target = targetCheck(env);
  if (!target.match) return { ok: false, error: 'target_mismatch', target };
  if (!target.schemaFlag) return { ok: false, error: 'schema_unconfirmed', target };
  return { ok: true, target };
}

function rejectStore(error) {
  if (!error) return;
  if (error.code === 'PGRST106') throw new Error('schema_not_exposed');
  throw new Error('store_failed');
}

function cockpitFrom(env) {
  const guard = supabaseGuard(env);
  if (!guard.ok) throw new Error(guard.error);
  return db(env).schema('cockpit');
}

export function openSupabaseStore(env = process.env) {
  const client = () => cockpitFrom(env);
  return {
    backend: 'supabase',
    shared: true,
    async listBaseline() {
      const { data, error } = await client().from('forecast_baseline_cells').select('*');
      rejectStore(error);
      return (data || []).map((row) => ({
        id: row.id,
        spreadsheetId: row.source_workbook_id,
        sheetId: Number(row.source_sheet_id),
        rowNumber: row.source_row,
        label: row.label,
        groupId: row.group_id,
        period: row.period,
        cellState: row.cell_state,
        nullState: row.cell_state === 'value' ? 'amount' : row.cell_state,
        amountMinor: row.value_minor == null ? null : Number(row.value_minor),
        enteredMinor: row.value_minor == null ? null : Number(row.value_minor),
        effectiveMinor: row.value_minor == null ? null : Number(row.value_minor),
        sourceHash: row.source_hash,
        sourceCell: row.source_cell,
        currency: row.currency,
        provenance: 'forecast_baseline',
        isActual: false,
      }));
    },
    async saveBaseline(cells) {
      const snapshotHash = cells[0]?.snapshotHash;
      if (!snapshotHash) throw new Error('snapshot_hash_required');
      const snapshot = {
        snapshot_hash: snapshotHash,
        source_workbook_id: cells[0].spreadsheetId,
        source_sheet_id: cells[0].sheetId,
        record_count: cells.length,
        period_count: new Set(cells.map((cell) => cell.period)).size,
        source_row_count: new Set(cells.map((cell) => cell.rowNumber)).size,
        value_count: cells.filter((cell) => (cell.cellState || cell.nullState) === 'value' || cell.nullState === 'amount').length,
        blank_count: cells.filter((cell) => (cell.cellState || cell.nullState) === 'blank').length,
        zero_count: cells.filter((cell) => (cell.cellState || cell.nullState) === 'zero').length,
        group_null_count: cells.filter((cell) => cell.groupId == null).length,
      };
      const savedSnapshot = await client().from('forecast_snapshots').upsert(snapshot, { onConflict: 'snapshot_hash' });
      rejectStore(savedSnapshot.error);
      const rows = cells.map((cell) => ({
        id: cell.id,
        snapshot_hash: snapshotHash,
        source_workbook_id: cell.spreadsheetId,
        source_sheet_id: cell.sheetId,
        source_cell: cell.sourceCell,
        source_row: cell.rowNumber,
        label: cell.label,
        period: cell.period,
        scenario: 'forecast',
        cell_state: cell.cellState || (cell.nullState === 'amount' ? 'value' : cell.nullState),
        value_minor: cell.enteredMinor,
        currency: cell.currency || 'GBP',
        group_id: cell.groupId ?? null,
        user_entered: cell.userEntered ?? null,
        displayed: cell.displayed ?? null,
        source_hash: cell.sourceHash,
        is_actual: false,
      }));
      const { error } = await client().from('forecast_baseline_cells').upsert(rows, { onConflict: 'id' });
      rejectStore(error);
      return { created: rows.length, updated: 0, cells: await this.listBaseline() };
    },
    async listEvidence() {
      const [periods, lines, alternative, reconciliation, invoices, planning] = await Promise.all([
        client().from('accounting_periods').select('*'),
        client().from('accounting_lines').select('*'),
        client().from('forecast_scenario_cells').select('*'),
        client().from('reconciliation_evidence').select('*'),
        client().from('invoice_evidence').select('*'),
        client().from('planning_evidence').select('*'),
      ]);
      for (const result of [periods, lines, alternative, reconciliation, invoices, planning]) rejectStore(result.error);
      if (!periods.data?.length) return null;
      return evidenceFromRows({
        accountingPeriods: periods.data,
        accountingLines: lines.data,
        alternativeCells: alternative.data,
        reconciliation: reconciliation.data,
        invoices: invoices.data,
        planning: planning.data,
      });
    },
    async saveEvidence(evidence) {
      const rows = evidenceToRows(evidence);
      const periods = await client().from('accounting_periods').upsert(rows.accountingPeriods);
      rejectStore(periods.error);
      const lines = await client().from('accounting_lines').upsert(rows.accountingLines, { onConflict: 'id' });
      rejectStore(lines.error);
      const alternative = await client().from('forecast_scenario_cells').upsert(rows.alternativeCells, { onConflict: 'id' });
      rejectStore(alternative.error);
      const reconciliation = await client().from('reconciliation_evidence').upsert(rows.reconciliation, { onConflict: 'id' });
      rejectStore(reconciliation.error);
      const invoices = await client().from('invoice_evidence').upsert(rows.invoices, { onConflict: 'id' });
      rejectStore(invoices.error);
      const planning = await client().from('planning_evidence').upsert(rows.planning, { onConflict: 'id' });
      rejectStore(planning.error);
      return this.listEvidence();
    },
    async listPlans() {
      const { data, error } = await client().from('plan_entries').select('*').eq('area', 'toki');
      rejectStore(error);
      return (data || []).map(rowToPlan);
    },
    async savePlan(entry) {
      const { data, error } = await client().from('plan_entries').upsert(planToRow(entry)).select('*').limit(1);
      rejectStore(error);
      return rowToPlan(data[0]);
    },
    async deletePlan(id) {
      const { data, error } = await client().from('plan_entries').delete().eq('id', id).eq('area', 'toki').select('id');
      rejectStore(error);
      return { deleted: Boolean(data?.length), id };
    },
    async listIncomeDetails() {
      const { data, error } = await client().from('income_detail_lines').select('*');
      if (relationMissing(error)) return { ok: false, error: 'income_detail_schema_required', records: [] };
      rejectStore(error);
      return (data || []).map(detailFromRow);
    },
    async saveIncomeDetail(record) {
      const { data, error } = await client().from('income_detail_lines').upsert(detailToRow(record), { onConflict: 'id' }).select('*').limit(1);
      if (relationMissing(error)) return { ok: false, error: 'income_detail_schema_required' };
      rejectStore(error);
      return detailFromRow(data[0]);
    },
    async deleteIncomeDetail(id) {
      const { data, error } = await client()
        .from('income_detail_lines')
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id)
        .is('deleted_at', null)
        .select('id');
      if (relationMissing(error)) return { ok: false, error: 'income_detail_schema_required' };
      rejectStore(error);
      return { deleted: Boolean(data?.length), tombstone: true, id };
    },
    async listOutstanding() {
      const { data, error } = await client().from('outstanding_items').select('*').is('done_at', null);
      if (relationMissing(error)) return { ok: false, error: 'outstanding_schema_required', items: [] };
      rejectStore(error);
      return (data || []).filter((row) => !row.done_at).map(outstandingFromRow);
    },
    async saveOutstanding(item) {
      const { data, error } = await client().from('outstanding_items').upsert({
        id: item.id,
        title: item.title,
        done_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' }).select('*').limit(1);
      if (relationMissing(error)) return { ok: false, error: 'outstanding_schema_required' };
      rejectStore(error);
      return outstandingFromRow(data[0]);
    },
    async completeOutstanding(id) {
      const { data, error } = await client().from('outstanding_items').update({
        done_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', id).is('done_at', null).select('id');
      if (relationMissing(error)) return { ok: false, error: 'outstanding_schema_required' };
      rejectStore(error);
      return { done: Boolean(data?.length), id };
    },
    async readAccessPin() {
      const { data, error } = await client().from('jrl_access_pin').select('pin_hash').limit(1);
      if (relationMissing(error)) return { ok: false, error: 'pin_store_not_ready', enabled: false, hash: null };
      rejectStore(error);
      const row = Array.isArray(data) ? data[0] : data;
      const hash = row?.pin_hash || null;
      return { ok: true, enabled: Boolean(hash), hash };
    },
    async saveAccessPin(hash) {
      const { error } = await client().from('jrl_access_pin').upsert({
        id: true,
        pin_hash: hash || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (relationMissing(error)) return { ok: false, error: 'pin_store_not_ready' };
      rejectStore(error);
      return { ok: true, enabled: Boolean(hash) };
    },
    async readPotRecord() {
      const { data, error } = await client().from('jrl_pot_preferences').select('*').limit(1);
      if (relationMissing(error)) return { ok: false, error: 'pot_store_not_ready' };
      rejectStore(error);
      return potDocument(data);
    },
    async savePotRecord(record) {
      const { data, error } = await client()
        .from('jrl_pot_preferences')
        .upsert({ id: true, version: 1, document: record, updated_at: new Date().toISOString() }, { onConflict: 'id' })
        .select('document')
        .limit(1);
      if (relationMissing(error)) return { ok: false, error: 'pot_store_not_ready' };
      rejectStore(error);
      const saved = potDocument(data);
      return saved || record;
    },
    async workflowsForZap(zapId) {
      const { data, error } = await client().from('automation_registry').select('*').eq('zap_id', zapId);
      rejectStore(error);
      return (data || []).map((row) => ({
        accountSlug: row.account_slug,
        zapId: row.zap_id,
        title: row.title,
      }));
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
      rejectStore(error);
      return { created: true, record: data[0] };
    },
    async insertEvent(event) {
      const { data: existing, error: readError } = await client().from('automation_events').select('event_id').eq('event_id', event.eventId).limit(1);
      rejectStore(readError);
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
      rejectStore(error);
      return { deduped: false, event };
    },
    async saveToken({ provider, tenantKey, payload }) {
      if (provider === 'jrl') {
        const error = new Error('jrl_requires_generation');
        error.code = 'jrl_requires_generation';
        throw error;
      }
      const enc = encryptToken(payload, env);
      if (!enc.ok) throw new Error(enc.error);
      const { error } = await client().from('app_oauth_tokens').upsert({
        provider,
        tenant_key: tenantKey,
        ciphertext: enc.ciphertext,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider,tenant_key' });
      rejectStore(error);
      return { ok: true };
    },
    async readToken({ provider, tenantKey }) {
      const result = await readOauthToken(client(), env, { provider, tenantKey });
      this.lastOwnerProbe = result.probe || null;
      if (!result.ok) {
        const error = new Error(result.error);
        error.code = result.error;
        error.probe = result.probe;
        throw error;
      }
      if (!result.record) return { missing: true, probe: result.probe };
      result.record.probe = result.probe;
      return result.record;
    },
    async compareAndSwapToken(args) {
      return compareAndSwapOauthToken(client(), env, args);
    },
    async consumeNonce(nonce) {
      const { data, error } = await client().from('login_attempts').select('id').eq('subject', `nonce:${nonce}`).limit(1);
      rejectStore(error);
      if (data?.length) return false;
      const { error: insertError } = await client().from('login_attempts').insert({ subject: `nonce:${nonce}` });
      rejectStore(insertError);
      return true;
    },
    async addFailure(subject, at) {
      const { error } = await client().from('login_attempts').insert({ subject, failed_at: new Date(at).toISOString() });
      rejectStore(error);
    },
    async failures(subject, since) {
      const { data, error } = await client().from('login_attempts').select('failed_at').eq('subject', subject).gte('failed_at', new Date(since).toISOString());
      rejectStore(error);
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
