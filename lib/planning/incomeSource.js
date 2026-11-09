import fs from 'fs';

// Reads a configured private snapshot. It does not invent clients when the file is absent,
// and it does not turn a handwritten "n of m" comment into a start or end date.

const MONTH = /^(20\d{2})-(0[1-9]|1[0-2])$/;

const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/;
const DATE = /^(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function kindOf(value) {
  if (value === 'retainer' || value === 'project' || value === 'additional_cost') return value;
  return null;
}

function sourceId(row, kind) {
  const explicit = row?.sourceRowId || row?.source_row_id;
  if (explicit && SOURCE_ID.test(String(explicit))) return String(explicit);
  const sheet = String(row?.sheet || kind || '').replace(/[^A-Za-z0-9:_-]/g, '');
  const rowNumber = Number(row?.row);
  if (!sheet || !Number.isInteger(rowNumber) || rowNumber < 1) return null;
  const built = `${sheet}:${rowNumber}`;
  return SOURCE_ID.test(built) ? built : null;
}

function amountMinor(row, unit) {
  if (row?.amountMinor != null && row.amountMinor !== '') {
    const value = Number(row.amountMinor);
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  if (row?.amountPence != null && row.amountPence !== '') {
    const value = Number(row.amountPence);
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  if (unit === 'pounds' && row?.amount != null && row.amount !== '') {
    const value = Number(row.amount);
    return Number.isFinite(value) ? Math.round(value * 100) : null;
  }
  if (unit === 'pence' && row?.amount != null && row.amount !== '') {
    const value = Number(row.amount);
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  return null;
}

export function adaptSourceRow(row, fallbackKind, unit) {
  const kind = kindOf(row?.kind) || kindOf(fallbackKind);
  const sourceRowId = sourceId(row, kind);
  if (!sourceRowId || !kind) return null;
  const end = row?.contractEndDate ? String(row.contractEndDate).slice(0, 10) : '';
  const knownEnd = DATE.test(end);
  const unknownEnd = kind === 'retainer' && !knownEnd;
  return {
    id: `source_${sourceRowId.replace(/[^a-zA-Z0-9:_-]/g, '_')}`,
    layer: 'detail',
    version: 1,
    kind,
    party: String(row.client || row.party || row.name || '').trim() || 'Unnamed',
    services: row.services ? String(row.services) : '',
    amountMinor: amountMinor(row, unit),
    comment: row.comment ? String(row.comment) : '',
    currency: 'GBP',
    firstPaymentMonth: MONTH.test(row.firstPaymentMonth || '') ? row.firstPaymentMonth : null,
    contractEndDate: knownEnd ? end : null,
    contractEndUnknown: unknownEnd,
    totalPayments: Number.isInteger(Number(row.totalPayments)) ? Number(row.totalPayments) : null,
    observedMonth: MONTH.test(row.month || '') ? row.month : null,
    source: 'snapshot',
    sourceRowId,
    deletedAt: null,
  };
}

export function adaptSnapshot(payload) {
  const unit = payload?.amountUnit === 'pounds' || payload?.amountUnit === 'pence' ? payload.amountUnit : null;
  const grouped = [
    ...(Array.isArray(payload?.rows) ? payload.rows.map((row) => [row, null]) : []),
    ...(Array.isArray(payload?.retainers) ? payload.retainers.map((row) => [row, 'retainer']) : []),
    ...(Array.isArray(payload?.projects) ? payload.projects.map((row) => [row, 'project']) : []),
    ...(Array.isArray(payload?.costs) ? payload.costs.map((row) => [row, 'additional_cost']) : []),
  ];
  return grouped.map(([row, kind]) => adaptSourceRow(row, kind, unit)).filter(Boolean);
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
