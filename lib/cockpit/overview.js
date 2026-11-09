import { incomeBreakdown, workingMonthLines } from '../planning/entries.js';
import { priceZaps } from '../automations/savings.js';

export const OVERVIEW_MONTHS = [
  ['01', 'Jan'], ['02', 'Feb'], ['03', 'Mar'], ['04', 'Apr'],
  ['05', 'May'], ['06', 'Jun'], ['07', 'Jul'], ['08', 'Aug'],
  ['09', 'Sep'], ['10', 'Oct'], ['11', 'Nov'], ['12', 'Dec'],
];

export function incomeYear(rows, plan, year, actuals) {
  return OVERVIEW_MONTHS.map(([id, label]) => {
    const key = `${year}-${id}`;
    const split = incomeBreakdown(workingMonthLines(rows, plan, key));
    const billing = actuals?.months?.[key]?.billing;
    return {
      id: key,
      label,
      retainer: split.retainer,
      project: split.project,
      total: split.total,
      actual: billing == null ? null : billing,
      lines: split.lines,
    };
  });
}

function addMonths(start, count) {
  const date = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1 + count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function coversMonth(row, kind, month) {
  if (!row || row.deletedAt || row.kind !== kind) return false;
  const start = row.firstPaymentMonth || '';
  if (start && start > month) return false;
  const end = row.contractEndDate ? String(row.contractEndDate).slice(0, 7) : '';
  if (end && end < month) return false;
  if (!start && !end) return false;
  if (kind === 'project' && start && Number(row.totalPayments) > 0 && !end) {
    if (month > addMonths(start, Number(row.totalPayments) - 1)) return false;
  }
  return true;
}

export function clientsForSegment(details, kind, month) {
  return (details || []).filter((row) => coversMonth(row, kind, month)).map((row) => ({
    id: row.id || row.party,
    name: row.party,
    minor: row.amountMinor == null || !Number.isFinite(Number(row.amountMinor)) ? null : Number(row.amountMinor),
  }));
}

export function retainersEnding(details, now = new Date(), withinMonths = 3) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + withinMonths, now.getUTCDate()));
  return (details || []).filter((row) => {
    if (row.kind !== 'retainer' || row.deletedAt || !row.contractEndDate) return false;
    const when = new Date(`${String(row.contractEndDate).slice(0, 10)}T00:00:00Z`);
    return when >= start && when <= end;
  }).sort((a, b) => String(a.contractEndDate).localeCompare(String(b.contractEndDate)));
}

export function clientSavings(zapRows, rates = []) {
  const map = new Map();
  for (const zap of priceZaps(zapRows, rates)) {
    const name = zap.account || 'Unknown account';
    const current = map.get(name) || { name, runs: 0, hours: 0, pounds: 0 };
    current.runs += zap.runs || 0;
    current.hours += zap.hours || 0;
    current.pounds += zap.pounds || 0;
    map.set(name, current);
  }
  return [...map.values()].sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
}

export function poundTicks(maxMinor) {
  const pounds = Math.max((Number(maxMinor) || 0) / 100, 1);
  const rough = pounds / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((value) => value >= rough) || magnitude * 10;
  const top = Math.ceil(pounds / step) * step;
  const ticks = [];
  for (let value = top; value >= 0; value -= step) ticks.push(Math.round(value * 100) / 100);
  return { topMinor: top * 100, ticks };
}

export function hourTicks(maxHours) {
  const hours = Math.max(Number(maxHours) || 0, 1);
  const rough = hours / 4;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rough, 0.1)));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((value) => value >= rough) || magnitude * 10;
  const top = Math.ceil(hours / step) * step;
  const ticks = [];
  for (let value = top; value >= 0; value -= step) ticks.push(Math.round(value * 10) / 10);
  return { top, ticks };
}
