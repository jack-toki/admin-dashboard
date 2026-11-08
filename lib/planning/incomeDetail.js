// Client lines are a detail layer. They are not added to the profit-and-loss
// aggregate and they do not replace it unless the person chooses that explicitly.
// A contract end date is kept as a date. "n of m" is a schedule position, not a receipt.

const MONTH = /^(20\d{2})-(0[1-9]|1[0-2])$/;
const DATE = /^(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const KINDS = new Set(['retainer', 'project', 'additional_cost']);

export function inclusiveMonths(start, endMonth) {
  if (!MONTH.test(start || '') || !MONTH.test(endMonth || '') || endMonth < start) return null;
  const out = [];
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  while (`${year}-${String(month).padStart(2, '0')}` <= endMonth) {
    out.push(`${year}-${String(month).padStart(2, '0')}`);
    if (out.length > 36) return null;
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

export function scheduleFor(record, month) {
  const start = record?.firstPaymentMonth || '';
  const endDate = record?.contractEndDate || '';
  if (!MONTH.test(start) || !DATE.test(endDate)) {
    return { state: 'unknown', active: false, label: 'Schedule unknown', received: false };
  }
  const span = inclusiveMonths(start, endDate.slice(0, 7));
  if (!span) return { state: 'unknown', active: false, label: 'Schedule unknown', received: false };
  const derived = span.length;
  const total = Number.isInteger(Number(record.totalPayments)) && Number(record.totalPayments) >= 1
    ? Number(record.totalPayments)
    : derived;
  const index = span.indexOf(month);
  if (index < 0) return { state: 'outside', active: false, total, label: 'No payment this month', received: false };
  return {
    state: 'scheduled',
    active: true,
    position: index + 1,
    total,
    label: `Scheduled ${index + 1} of ${total}`,
    received: false,
  };
}

export function validateIncomeDetail(input) {
  const errors = [];
  const kind = KINDS.has(input?.kind) ? input.kind : null;
  if (!kind) errors.push('kind');
  const party = String(input?.party || '').trim();
  if (!party) errors.push('party');
  let amountMinor = null;
  if (input?.amountMinor != null && input.amountMinor !== '') {
    amountMinor = Number(input.amountMinor);
    if (!Number.isFinite(amountMinor)) errors.push('amount');
  }
  const firstPaymentMonth = input?.firstPaymentMonth ? String(input.firstPaymentMonth) : null;
  const contractEndDate = input?.contractEndDate ? String(input.contractEndDate) : null;
  if (firstPaymentMonth && !MONTH.test(firstPaymentMonth)) errors.push('start');
  if (contractEndDate && !DATE.test(contractEndDate)) errors.push('end');
  let totalPayments = null;
  if (input?.totalPayments != null && input.totalPayments !== '') {
    totalPayments = Number(input.totalPayments);
    if (!Number.isInteger(totalPayments) || totalPayments < 1 || totalPayments > 36) errors.push('payments');
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    record: {
      id: input.id || `detail_${Math.random().toString(36).slice(2, 10)}`,
      layer: 'detail',
      version: 1,
      kind,
      party,
      services: input.services ? String(input.services).trim() : '',
      amountMinor,
      comment: input.comment ? String(input.comment) : '',
      currency: 'GBP',
      firstPaymentMonth,
      contractEndDate,
      totalPayments,
      observedMonth: MONTH.test(input.observedMonth || '') ? input.observedMonth : null,
      source: input.source === 'snapshot' ? 'snapshot' : 'manual',
      sourceRowId: input.sourceRowId ? String(input.sourceRowId) : null,
      deletedAt: input.deletedAt || null,
    },
  };
}

export function presentDetails(stored, sourceRows) {
  const kept = stored || [];
  const tombstones = new Set(kept.filter((row) => row.deletedAt && row.sourceRowId).map((row) => row.sourceRowId));
  const overrides = new Map(kept.filter((row) => row.sourceRowId && !row.deletedAt).map((row) => [row.sourceRowId, row]));
  const fromSource = [];
  for (const row of sourceRows || []) {
    if (!row?.sourceRowId || tombstones.has(row.sourceRowId)) continue;
    fromSource.push(overrides.get(row.sourceRowId) || row);
  }
  const manual = kept.filter((row) => !row.sourceRowId && !row.deletedAt);
  return [...fromSource, ...manual];
}

export function activeInMonth(record, month) {
  if (record?.kind === 'additional_cost') return record.observedMonth === month;
  const schedule = scheduleFor(record, month);
  if (schedule.state === 'scheduled') return true;
  if (schedule.state === 'outside') return false;
  return record?.observedMonth === month;
}

export function detailSum(records, month, kind) {
  const rows = (records || []).filter((record) => record.kind === kind && activeInMonth(record, month));
  if (!rows.length) return null;
  if (rows.some((record) => record.amountMinor == null)) return null;
  return rows.reduce((sum, record) => sum + record.amountMinor, 0);
}

export function reconcileKind(records, baselineMinor, month, kind) {
  const detail = detailSum(records, month, kind);
  return {
    baseline: baselineMinor == null ? null : baselineMinor,
    detail,
    difference: baselineMinor == null || detail == null ? null : detail - baselineMinor,
  };
}

export function isDetailRecord(entry) {
  return entry?.layer === 'detail' || entry?.provenance === 'income_detail';
}
