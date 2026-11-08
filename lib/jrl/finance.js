// Derived from the JRL contract: store flows, not balances.
// Market gain is not part of the headline net. A missing HargLans value is not zero.

export const BENCHMARK = 0.07;
export const FLOW_FIELDS = ['tax_in', 'savings_in', 'hl_in', 'savings_out'];
export const ENTRY_FIELDS = ['tax_in', 'savings_in', 'hl_in', 'savings_out', 'hl_value'];

function flow(value) {
  if (value == null || value === '') return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function reading(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normaliseEntry(input) {
  return {
    period: String(input.period || ''),
    tax_in: flow(input.tax_in),
    savings_in: flow(input.savings_in),
    hl_in: flow(input.hl_in),
    savings_out: flow(input.savings_out),
    hl_value: reading(input.hl_value),
    source: input.source || 'dashboard',
  };
}

export function upsertEntry(entries, input) {
  const entry = normaliseEntry(input);
  const rest = (entries || []).filter((row) => row.period !== entry.period);
  return [...rest, entry].sort((a, b) => a.period.localeCompare(b.period));
}

export function deriveLedger(entries) {
  let savings = 0;
  let tax = 0;
  let contributed = 0;
  let lastValue = null;
  let sinceLast = 0;
  const rows = [];
  for (const raw of [...(entries || [])].sort((a, b) => a.period.localeCompare(b.period))) {
    const entry = normaliseEntry(raw);
    savings += entry.savings_in - entry.savings_out;
    tax += entry.tax_in;
    contributed += entry.hl_in;
    const chase = savings + tax;
    const net = chase + contributed;
    let earned = null;
    let gain = null;
    let carried = false;
    let chartValue = lastValue;
    if (entry.hl_value == null) {
      carried = lastValue != null;
      sinceLast += entry.hl_in;
    } else {
      const previous = lastValue;
      const contributionsSince = previous == null ? contributed : sinceLast + entry.hl_in;
      earned = entry.hl_value - (previous == null ? 0 : previous) - contributionsSince;
      gain = entry.hl_value - contributed;
      chartValue = entry.hl_value;
      lastValue = entry.hl_value;
      sinceLast = 0;
    }
    rows.push({
      ...entry,
      savings_total: savings,
      tax_total: tax,
      hl_contributed: contributed,
      chase_total: chase,
      net_total: net,
      hl_chart_value: chartValue,
      hl_carried: carried,
      earned,
      gain,
      overdrawn: savings < 0,
    });
  }
  return rows;
}

export function projectValue(value, years) {
  if (value == null) return null;
  return value * (1 + BENCHMARK) ** years;
}

export function projectionRows(value) {
  return [5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map((years) => ({
    years,
    value: projectValue(value, years),
    newMoney: 0,
  }));
}

export function annualised(gain, contributed, months) {
  if (gain == null || contributed <= 0 || months < 1) return null;
  const multiple = 1 + gain / contributed;
  if (multiple <= 0) return null;
  return multiple ** (12 / months) - 1;
}

export function verdict(rate, months) {
  if (rate == null) return null;
  return {
    label: rate + 1e-12 >= BENCHMARK ? 'Tracking well' : 'Lagging',
    gapPoints: (rate - BENCHMARK) * 100,
    caveat: months < 12,
    benchmark: BENCHMARK,
    settingIgnored: ['finance_setting.benchmark_rate', 'finance_setting.chase_interest_rate'],
  };
}
