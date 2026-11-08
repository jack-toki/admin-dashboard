// Maps the review tables. A missing relation is the only not-ready signal.
// A column error, a conflict, or a refused write is a store failure.

export function relationMissing(error) {
  if (!error) return false;
  const code = String(error.code || '');
  if (code === '42P01' || code === 'PGRST205') return true;
  const message = String(error.message || '');
  return /schema cache|does not exist/i.test(message)
    && /income_detail_lines|jrl_pot_preferences/i.test(message);
}

export function detailFromRow(row) {
  return {
    id: row.id,
    layer: 'detail',
    version: Number(row.version) || 1,
    kind: row.kind,
    party: row.party,
    services: row.services || '',
    amountMinor: row.amount_minor == null ? null : Number(row.amount_minor),
    comment: row.comment || '',
    currency: row.currency || 'GBP',
    firstPaymentMonth: row.first_payment_month || null,
    contractEndDate: row.contract_end_date ? String(row.contract_end_date).slice(0, 10) : null,
    contractEndUnknown: row.contract_end_unknown === true,
    totalPayments: row.total_payments == null ? null : Number(row.total_payments),
    observedMonth: row.observed_month || null,
    source: row.source === 'snapshot' ? 'snapshot' : 'manual',
    sourceRowId: row.source_row_id || null,
    deletedAt: row.deleted_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function detailToRow(record) {
  return {
    id: record.id,
    layer: 'detail',
    version: 1,
    kind: record.kind,
    party: record.party,
    services: record.services || null,
    amount_minor: record.amountMinor,
    comment: record.comment || null,
    currency: 'GBP',
    first_payment_month: record.firstPaymentMonth || null,
    contract_end_date: record.contractEndUnknown ? null : (record.contractEndDate || null),
    contract_end_unknown: record.contractEndUnknown === true,
    total_payments: record.totalPayments,
    observed_month: record.observedMonth || null,
    source: record.source === 'snapshot' ? 'snapshot' : 'manual',
    source_row_id: record.sourceRowId || null,
    deleted_at: record.deletedAt || null,
    updated_at: new Date().toISOString(),
  };
}
