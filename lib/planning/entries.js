const MONTH = /^(20\d{2})-(0[1-9]|1[0-2])$/;

export function validateEntry(input) {
  const errors = [];
  const kind = input.kind === 'cost' ? 'cost' : input.kind === 'sale' ? 'sale' : null;
  if (!kind) errors.push('kind');
  if (input.amountMinor == null || !Number.isFinite(Number(input.amountMinor))) errors.push('amount');
  const currency = String(input.currency || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) errors.push('currency');
  if (!MONTH.test(String(input.month || ''))) errors.push('month');
  if (!String(input.party || '').trim()) errors.push('party');
  if (!String(input.groupId || '').trim()) errors.push('group');
  const timing = input.timing === 'recurring' ? 'recurring' : 'one_off';
  let duration = null;
  if (timing === 'recurring') {
    duration = Number(input.durationMonths);
    if (!Number.isInteger(duration) || duration < 1 || duration > 24) errors.push('duration');
  }
  let probability = null;
  if (kind === 'sale' && input.probability != null && input.probability !== '') {
    probability = Number(input.probability);
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) errors.push('probability');
  }
  const attestation = ['forecast', 'invoiced', 'paid'].includes(input.attestation) ? input.attestation : 'forecast';
  return {
    ok: errors.length === 0,
    errors,
    entry: errors.length ? null : {
      id: input.id || `plan_${Math.random().toString(36).slice(2, 10)}`,
      kind,
      amountMinor: Math.trunc(Number(input.amountMinor)),
      currency,
      month: input.month,
      party: String(input.party).trim(),
      groupId: String(input.groupId).trim(),
      timing,
      durationMonths: duration,
      probability,
      stage: kind === 'sale' && input.stage ? String(input.stage).trim() : null,
      attestation,
      attestationSource: 'manual',
      xeroVerified: false,
      provenance: 'manual_plan',
      externalRef: input.externalRef ? String(input.externalRef) : null,
      matchId: input.matchId || null,
      createdAt: input.createdAt || new Date().toISOString(),
    },
  };
}

export function expandTimeline(entry) {
  if (!entry || entry.timing !== 'recurring') return entry ? [entry.month] : [];
  const [year, month] = entry.month.split('-').map(Number);
  const out = [];
  for (let i = 0; i < entry.durationMonths; i += 1) {
    const index = month - 1 + i;
    const y = year + Math.floor(index / 12);
    const m = (index % 12) + 1;
    out.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return out;
}

export function workingPlanMinor(baselineMinor, entries, month, groupId) {
  let extra = 0;
  let used = false;
  for (const entry of entries || []) {
    if (entry.matchId) continue;
    if (entry.groupId !== groupId) continue;
    if (!expandTimeline(entry).includes(month)) continue;
    extra += entry.amountMinor;
    used = true;
  }
  if (baselineMinor == null && !used) return null;
  return (baselineMinor || 0) + extra;
}

export function salesFromCrm() {
  return [];
}
