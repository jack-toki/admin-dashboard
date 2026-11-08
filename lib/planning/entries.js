import { operationalGroup } from '../groups.js';

const MONTH = /^(20\d{2})-(0[1-9]|1[0-2])$/;
const KNOWN_INCOME = {
  'retained clients': 'retainer',
  retainer: 'retainer',
  'project work': 'project',
  project: 'project',
};

export function lineMatchId(row, month) {
  return `cell:${row?.rowNumber ?? row?.label}:${month}`;
}

export function incomeWorkType(label) {
  return KNOWN_INCOME[String(label || '').trim().toLowerCase().replace(/\s+/g, ' ')] || null;
}

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

export function rowsWithReplacements(rows, entries) {
  const overrides = new Map();
  for (const entry of entries || []) {
    if (entry?.matchId) overrides.set(entry.matchId, entry);
  }
  return (rows || []).map((row) => {
    let group = row.group;
    const cells = {};
    for (const [month, cell] of Object.entries(row.cells || {})) {
      const hit = overrides.get(lineMatchId(row, month));
      if (!hit || !expandTimeline(hit).includes(month)) {
        cells[month] = cell;
        continue;
      }
      cells[month] = { ...cell, minor: hit.amountMinor, blank: false };
      if (row.kind === 'cost' && hit.groupId) group = { ...(row.group || {}), groupId: hit.groupId, sourceConfirmed: true };
    }
    return { ...row, group, cells };
  });
}

export function workingMonthLines(rows, entries, month) {
  const overrides = new Map();
  const extras = [];
  for (const entry of entries || []) {
    if (!expandTimeline(entry).includes(month)) continue;
    if (entry.matchId) overrides.set(entry.matchId, entry);
    else extras.push(entry);
  }
  const lines = [];
  for (const row of rows || []) {
    const bucket = operationalGroup(row);
    const include = row.kind === 'revenue' || row.kind === 'cost' || (row.kind === 'metric' && bucket && bucket !== 'billing');
    if (!include) continue;
    const cell = row.cells?.[month];
    const baseMinor = !cell || cell.blank || cell.minor == null ? null : cell.minor;
    const matchId = lineMatchId(row, month);
    const hit = overrides.get(matchId);
    const kind = row.kind === 'revenue' ? 'sale' : 'cost';
    const knownType = kind === 'sale' ? incomeWorkType(row.label) : null;
    lines.push({
      key: matchId,
      matchId,
      rowLabel: row.label,
      party: hit?.party || row.label,
      kind,
      workType: kind === 'sale' ? (hit?.stage === 'retainer' || hit?.stage === 'project' ? hit.stage : knownType) : null,
      workTypeKnown: kind === 'sale' ? Boolean(hit?.stage === 'retainer' || hit?.stage === 'project' || knownType) : false,
      groupId: hit?.groupId || bucket || '',
      groupKnown: Boolean(hit?.groupId) || row.group?.sourceConfirmed === true || row.kind === 'revenue' || Boolean(bucket && row.kind === 'metric'),
      minor: hit ? hit.amountMinor : baseMinor,
      baseMinor,
      overridden: Boolean(hit),
      planId: hit?.id || '',
    });
  }
  for (const entry of extras) {
    lines.push({
      key: entry.id,
      matchId: null,
      rowLabel: entry.party,
      party: entry.party,
      kind: entry.kind,
      workType: entry.kind === 'sale' && (entry.stage === 'retainer' || entry.stage === 'project') ? entry.stage : null,
      workTypeKnown: entry.kind !== 'sale' || entry.stage === 'retainer' || entry.stage === 'project',
      groupId: entry.groupId || '',
      groupKnown: Boolean(entry.groupId),
      minor: entry.amountMinor,
      baseMinor: null,
      overridden: false,
      planId: entry.id,
      added: true,
    });
  }
  return lines;
}

const AGGREGATE_INCOME = new Set(['retained clients', 'project work']);

export function incomeBreakdown(lines) {
  const sales = (lines || []).filter((line) => line.kind === 'sale');
  const totals = { retainer: 0, project: 0, unallocated: 0 };
  const seen = { retainer: false, project: false, unallocated: false };
  const detail = sales.map((line) => {
    const type = line.workType === 'retainer' || line.workType === 'project' ? line.workType : 'unallocated';
    const known = line.minor != null && Number.isFinite(line.minor);
    if (known) {
      seen[type] = true;
      totals[type] += line.minor;
    }
    const sourceName = String(line.rowLabel || line.party || '').trim().toLowerCase();
    return {
      name: String(line.party || line.rowLabel || 'Unnamed line').trim() || 'Unnamed line',
      type,
      minor: known ? line.minor : null,
      aggregate: !line.added && AGGREGATE_INCOME.has(sourceName),
    };
  });
  return {
    retainer: seen.retainer ? totals.retainer : null,
    project: seen.project ? totals.project : null,
    unallocated: seen.unallocated ? totals.unallocated : null,
    total: sumLines(sales, 'sale'),
    lines: detail,
  };
}

export function sumLines(lines, kind) {
  let seen = false;
  let total = 0;
  for (const line of lines) {
    if (line.kind !== kind || line.minor == null) continue;
    if (kind === 'cost' && !line.groupId) continue;
    seen = true;
    total += line.minor;
  }
  return seen ? total : null;
}
