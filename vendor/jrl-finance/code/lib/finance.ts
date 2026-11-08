/**
 * JRL Finance — pure money logic. No I/O.
 * Single source of truth for every figure the dashboard shows.
 */

export const BENCHMARK_RATE = 0.07;
export const PROJECTION_YEARS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_ALIASES: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

// ─────────────────────────────────────────────────────────── money helpers
export const gbp = (n: number) =>
  "£" + Math.round(Number(n) || 0).toLocaleString("en-GB");

export const signed = (n: number) =>
  (n >= 0 ? "+" : "−") + gbp(Math.abs(n));

function num(raw: string): number | null {
  const cleaned = String(raw).replace(/[£,\s]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ─────────────────────────────────────────────────────────── performance
export interface MonthRow {
  period: string;
  hl_in: number;
  hl_contributed: number;
  hl_value: number;
}

/** Money-weighted (IRR) return across monthly contributions, annualised. */
export function annualisedIRR(monthlyCashflows: number[]): number | null {
  if (monthlyCashflows.length < 2) return null;
  const npv = (r: number) =>
    monthlyCashflows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);

  // Bracket the root. Returns can be extreme early on (a few months of data),
  // so widen the upper bound until the sign flips rather than giving up.
  let lo = -0.95, hi = 0.5;
  let flo = npv(lo);
  if (!Number.isFinite(flo)) return null;
  let fhi = npv(hi);
  for (let i = 0; i < 40 && flo * fhi > 0; i++) {
    hi *= 2;
    fhi = npv(hi);
    if (!Number.isFinite(fhi)) return null;
  }
  if (flo * fhi > 0) return null;              // genuinely no sign change

  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return Math.pow(1 + mid, 12) - 1;
    if (flo * fm < 0) { hi = mid; } else { lo = mid; flo = fm; }
  }
  return Math.pow(1 + (lo + hi) / 2, 12) - 1;
}

export interface Performance {
  currentValue: number;
  totalContributed: number;
  gainSoFar: number;
  simpleReturnPct: number | null;
  earningsThisMonth: number | null;
  annualisedPct: number | null;
  gapPP: number | null;
  verdict: "tracking well" | "lagging" | null;
}

export function performance(timeline: MonthRow[], benchmark = BENCHMARK_RATE): Performance {
  const n = timeline.length;
  const last = timeline[n - 1];
  const currentValue = Number(last?.hl_value) || 0;
  const totalContributed = Number(last?.hl_contributed) || 0;

  const cf = timeline.map((r) => -(Number(r.hl_in) || 0));
  cf[n - 1] += currentValue;

  const gainSoFar = currentValue - totalContributed;
  const simpleReturnPct = totalContributed > 0 ? (gainSoFar / totalContributed) * 100 : null;

  let earningsThisMonth: number | null = null;
  if (n >= 2) {
    const prevValue = Number(timeline[n - 2].hl_value) || 0;
    if (prevValue > 0) {
      earningsThisMonth = currentValue - prevValue - (Number(last.hl_in) || 0);
    }
  }

  const ann = totalContributed > 0 ? annualisedIRR(cf) : null;
  const annualisedPct = ann === null ? null : ann * 100;
  const gapPP = ann === null ? null : (ann - benchmark) * 100;
  const verdict = ann === null ? null : (ann >= benchmark ? "tracking well" : "lagging");

  return { currentValue, totalContributed, gainSoFar, simpleReturnPct,
           earningsThisMonth, annualisedPct, gapPP, verdict };
}

/** Today's value grown at the benchmark. No assumed future contributions. */
export function projection(currentValue: number, rate = BENCHMARK_RATE) {
  return PROJECTION_YEARS.map((years) => ({
    years,
    value: currentValue * Math.pow(1 + rate, years),
  }));
}
