import fs from 'fs';

// Reads a configured private snapshot. It does not invent clients when the file is absent,
// and it does not turn a handwritten "n of m" comment into a start or end date.

const MONTH = /^(20\d{2})-(0[1-9]|1[0-2])$/;

export function adaptSourceRow(row) {
  const sourceRowId = String(row?.sourceRowId || '');
  const kind = row?.kind === 'project' || row?.kind === 'additional_cost' ? row.kind : row?.kind === 'retainer' ? 'retainer' : null;
  if (!sourceRowId || !kind) return null;
  const amount = row.amountMinor == null || row.amountMinor === '' ? null : Number(row.amountMinor);
  return {
    id: `source_${sourceRowId.replace(/[^a-zA-Z0-9:_-]/g, '_')}`,
    layer: 'detail',
    version: 1,
    kind,
    party: String(row.client || row.party || '').trim() || 'Unnamed',
    services: row.services ? String(row.services) : '',
    amountMinor: Number.isFinite(amount) ? amount : null,
    comment: row.comment ? String(row.comment) : '',
    currency: 'GBP',
    firstPaymentMonth: null,
    contractEndDate: null,
    totalPayments: null,
    observedMonth: MONTH.test(row.month || '') ? row.month : null,
    source: 'snapshot',
    sourceRowId,
    deletedAt: null,
  };
}

export function adaptSnapshot(payload) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  return rows.map(adaptSourceRow).filter(Boolean);
}

export function loadIncomeSource(env = process.env, fsImpl = fs) {
  const file = String(env.INCOME_SOURCE_SNAPSHOT || '').trim();
  if (!file) return { ok: false, error: 'income_source_not_configured', records: [] };
  if (!fsImpl.existsSync(file)) return { ok: false, error: 'income_source_unavailable', records: [] };
  try {
    const payload = JSON.parse(fsImpl.readFileSync(file, 'utf8'));
    return { ok: true, records: adaptSnapshot(payload) };
  } catch {
    return { ok: false, error: 'income_source_unreadable', records: [] };
  }
}
