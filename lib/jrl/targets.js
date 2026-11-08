const DEFAULT_RATES = { savings: 0.045, chase: 0.045, tax: 0.045, net: 0, hl: 0 };

export function defaultRate(track) {
  return DEFAULT_RATES[track] ?? 0;
}

export function monthlyRate(annual) {
  if (!annual) return 0;
  return (1 + annual) ** (1 / 12) - 1;
}

function capped(months) {
  if (months == null || months > 1200) return null;
  return months;
}

export function monthsToTarget({ current = 0, target, monthly, rate = 0 }) {
  if (target == null || target <= current) return 0;
  if (monthly <= 0 && rate <= 0) return null;
  const r = monthlyRate(rate);
  if (!r) return capped(Math.ceil((target - current) / monthly));
  const numerator = target + monthly / r;
  const denominator = current + monthly / r;
  if (denominator <= 0 || numerator <= 0) return null;
  return capped(Math.ceil(Math.log(numerator / denominator) / Math.log(1 + r)));
}

export function monthlyForTarget({ current = 0, target, months, rate = 0 }) {
  if (!months || months < 1 || target == null) return null;
  const r = monthlyRate(rate);
  if (!r) return Math.max(0, (target - current) / months);
  const growth = (1 + r) ** months;
  return Math.max(0, (target - current * growth) * r / (growth - 1));
}

export function projectPath({ current = 0, monthly, rate = 0, months }) {
  const points = [{ month: 0, balance: current, contributed: current, growth: 0, step: 0 }];
  let balance = current;
  let contributed = 0;
  const r = monthlyRate(rate);
  for (let month = 1; month <= months; month += 1) {
    const before = balance;
    balance = r ? balance * (1 + r) + monthly : balance + monthly;
    contributed += monthly;
    points.push({ month, balance, contributed: current + contributed, growth: balance - current - contributed, step: balance - before });
  }
  return points;
}

export function recentMonthly(rows) {
  const last = (rows || []).slice(-3);
  if (!last.length) return 0;
  const sum = last.reduce((total, row) => total + Number(row.savings_in || 0) - Number(row.savings_out || 0), 0);
  return sum / last.length;
}

export function personalMonthlyPlan(targets) {
  return (targets || [])
    .filter((target) => target.scope === 'personal' && target.monthly_plan != null)
    .reduce((total, target) => total + Number(target.monthly_plan), 0);
}
