const DEFAULT_RATES = { savings: 0.045, chase: 0.045, tax: 0.045, net: 0, hl: 0 };

export function defaultRate(track) {
  return DEFAULT_RATES[track] ?? 0;
}

export function monthsToTarget({ current = 0, target, monthly, rate = 0 }) {
  if (target == null || target <= current) return 0;
  if (monthly <= 0 && rate <= 0) return null;
  if (!rate) return Math.ceil((target - current) / monthly);
  const r = rate / 12;
  const numerator = target + monthly / r;
  const denominator = current + monthly / r;
  if (denominator <= 0 || numerator <= 0) return null;
  return Math.ceil(Math.log(numerator / denominator) / Math.log(1 + r));
}

export function monthlyForTarget({ current = 0, target, months, rate = 0 }) {
  if (!months || months < 1 || target == null) return null;
  if (!rate) return (target - current) / months;
  const r = rate / 12;
  const growth = (1 + r) ** months;
  return (target - current * growth) * r / (growth - 1);
}

export function projectPath({ current = 0, monthly, rate = 0, months }) {
  const points = [];
  let balance = current;
  let contributed = 0;
  for (let month = 1; month <= months; month += 1) {
    const before = balance;
    balance = rate ? balance * (1 + rate / 12) + monthly : balance + monthly;
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
