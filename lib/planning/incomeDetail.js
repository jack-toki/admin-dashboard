// Client lines are a detail layer. They are not added to the profit-and-loss
// aggregate and they do not replace it unless the person chooses that explicitly.
// A contract end date is kept as a date. "n of m" is a schedule position, not a receipt.

const MONTH = /^(20\d{2})-(0[1-9]|1[0-2])$/;
const DATE = /^(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/;
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

function notedFraction(comment) {
  const match = String(comment || '').match(/\b(\d{1,2})\s+of\s+(\d{1,2})\b/i);
  if (!match) return null;
  const position = Number(match[1]);
  const total = Number(match[2]);
  if (position < 1 || total < 1 || position > total || total > 36) return null;
  return `${position} of ${total}`;
}

export function scheduleFor(record, month) {
  const start = record?.firstPaymentMonth || '';
  const endDate = record?.contractEndDate || '';
  if (!MONTH.test(start) || !DATE.test(endDate)) {
    const noted = notedFraction(record?.comment);
    return {
      state: 'unknown',
      active: false,
      label: noted ? `Note says ${noted}. Payment number unknown` : 'Payment number unknown',
      received: false,
    };
  }
  const span = inclusiveMonths(start, endDate.slice(0, 7));
  if (!span) return { state: 'unknown', active: false, label: 'Payment number unknown', received: false };
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
    label: `Payment ${index + 1} of ${total}`,
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
  const contractEndUnknown = input?.contractEndUnknown === true;
  const source = input?.source === 'snapshot' ? 'snapshot' : 'manual';
  if (input?.observedMonth && !MONTH.test(String(input.observedMonth))) errors.push('month');
  if (firstPaymentMonth && !MONTH.test(firstPaymentMonth)) errors.push('start');
  if (contractEndDate && !DATE.test(contractEndDate)) errors.push('end');
  if (contractEndUnknown && (source !== 'snapshot' || contractEndDate)) errors.push('end');
  if (kind === 'retainer' && !contractEndUnknown && !DATE.test(contractEndDate || '')) errors.push('end');
  const sourceRowId = input?.sourceRowId ? String(input.sourceRowId) : null;
  if (sourceRowId && !SOURCE_ID.test(sourceRowId)) errors.push('source');
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
      contractEndDate: contractEndUnknown ? null : contractEndDate,
      contractEndUnknown,
      totalPayments,
      observedMonth: MONTH.test(input.observedMonth || '') ? input.observedMonth : null,
      source,
      sourceRowId,
      deletedAt: input.deletedAt || null,
    },
  };
}

export function presentDetails(stored, sourceRows) {
  const tombstones = new Set((stored || []).filter((row) => row?.deletedAt && row.sourceRowId).map((row) => row.sourceRowId));
  const byKey = new Map();
  for (const row of stored || []) {
    if (!row || row.deletedAt) continue;
    const key = row.sourceRowId || `manual:${row.id}`;
    if (!byKey.has(key)) byKey.set(key, row);
  }
  for (const row of sourceRows || []) {
    if (!row?.sourceRowId || tombstones.has(row.sourceRowId) || byKey.has(row.sourceRowId)) continue;
    byKey.set(row.sourceRowId, row);
  }
  return [...byKey.values()];
}

export function shownInMonth(record, month) {
  if (!record || record.deletedAt) return false;
  if (record.kind === 'additional_cost') return record.observedMonth === month;
  if (record.observedMonth) return record.observedMonth === month;
  const schedule = scheduleFor(record, month);
  if (schedule.state === 'outside') return false;
  return true;
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
