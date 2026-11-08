/**
 * JRL Finance — target planning maths.
 *
 * Both directions of the same equation, so the answers always agree:
 *
 *   FV = P(1+r)^n + M · ((1+r)^n − 1) / r
 *
 *   P = what you have now      M = saved per month
 *   r = monthly growth rate    n = months
 *
 * Growth matters here. Over five years at 4.5% AER, ignoring interest
 * undershoots a cash target by a noticeable margin, so it's built in — set the
 * rate to 0 if you'd rather plan on contributions alone.
 */

export const MAX_MONTHS = 1200; // 100 years — past this we call it unreachable

/** Annual rate (0.045) → monthly compounding rate. */
export const monthlyRate = (annualRate: number) =>
  annualRate === 0 ? 0 : Math.pow(1 + annualRate, 1 / 12) - 1;

export interface Plan {
  current: number;
  target: number;
  annualRate: number;
}

/**
 * How many months until the target, saving `monthly` each month?
 * null = it never gets there.
 */
export function monthsToTarget(p: Plan & { monthly: number }): number | null {
  const { current, target, monthly } = p;
  if (target <= current) return 0;

  const r = monthlyRate(p.annualRate);

  if (r === 0) {
    if (monthly <= 0) return null;
    const n = Math.ceil((target - current) / monthly);
    return n > MAX_MONTHS ? null : n;
  }

  // n = log((T·r + M) / (P·r + M)) / log(1+r)
  const numerator = target * r + monthly;
  const denominator = current * r + monthly;
  if (denominator <= 0 || numerator <= 0) return null;

  const n = Math.log(numerator / denominator) / Math.log(1 + r);
  if (!Number.isFinite(n) || n < 0) return null;
  const months = Math.ceil(n);
  return months > MAX_MONTHS ? null : months;
}

/**
 * How much per month to hit the target in exactly `months`?
 * 0 means you're already there (or growth alone gets you there).
 */
export function monthlyForTarget(p: Plan & { months: number }): number | null {
  const { current, target, months } = p;
  if (months <= 0) return null;
  if (target <= current) return 0;

  const r = monthlyRate(p.annualRate);

  if (r === 0) return (target - current) / months;

  const growth = Math.pow(1 + r, months);
  const needed = (target - current * growth) * r / (growth - 1);
  return Math.max(0, needed);
}

/** Month-by-month path to the target, for the chart. */
export function projectPath(
  p: Plan & { monthly: number; months: number },
): { month: number; value: number }[] {
  const r = monthlyRate(p.annualRate);
  const out: { month: number; value: number }[] = [];
  let v = p.current;
  out.push({ month: 0, value: v });
  for (let i = 1; i <= Math.min(p.months, MAX_MONTHS); i++) {
    v = v * (1 + r) + p.monthly;
    out.push({ month: i, value: v });
  }
  return out;
}

/** "2 years 3 months" — friendlier than "27 months". */
export function humanMonths(n: number | null): string {
  if (n === null) return "never at this rate";
  if (n === 0) return "already there";
  if (n === 1) return "1 month";
  if (n < 12) return `${n} months`;
  const years = Math.floor(n / 12);
  const months = n % 12;
  const y = `${years} year${years === 1 ? "" : "s"}`;
  return months ? `${y} ${months} month${months === 1 ? "" : "s"}` : y;
}

/** The date that many months out. */
export function targetDate(n: number | null, from = new Date()): string | null {
  if (n === null) return null;
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + n, 1));
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Months between now and a chosen year-month, at least 1. */
export function monthsUntil(period: string, from = new Date()): number {
  const [y, m] = period.split("-").map(Number);
  const months = (y - from.getUTCFullYear()) * 12 + (m - 1 - from.getUTCMonth());
  return Math.max(1, months);
}
