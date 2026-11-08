import { BENCHMARK } from './finance.js';
import { personalMonthlyPlan } from './targets.js';

// Not a copy of lib/afford.ts. The source decides from a savings-first amount
// plus what was already saved this month. A boolean flag is not that input.

export function leftAloneCost(amount, years = 10) {
  if (amount == null) return null;
  return amount * (1 + BENCHMARK) ** years;
}

function amountOf(value) {
  if (typeof value === 'boolean') return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function savingsCommitment({ savingsFirst = 0, targets = [], savedThisMonth = 0 } = {}) {
  const required = Math.max(amountOf(savingsFirst), personalMonthlyPlan(targets));
  return required - amountOf(savedThisMonth);
}

export function advise({
  amount,
  kind = 'want',
  budget,
  spent = 0,
  emergencyFloor = 0,
  savingsFirst = 0,
  savedThisMonth = 0,
  savingsBalance = 0,
  targets = [],
} = {}) {
  if (budget == null || amount == null || amount === '') {
    return { verdict: null, advice: null, reason: 'needs_budget_and_price', sourceModule: false };
  }
  const price = Number(amount);
  const plan = personalMonthlyPlan(targets);
  const remaining = Number(budget) - Number(spent);
  const headroom = Number(savingsBalance) - Number(emergencyFloor);
  const stillToSave = savingsCommitment({ savingsFirst, targets, savedThisMonth });
  const challenges = [
    { id: 'what_it_really_costs', opportunity: leftAloneCost(price) },
    { id: 'this_month_so_far', spent, budget },
  ];
  if (plan > 0) challenges.push({ id: 'target_setback', personalOnly: true, monthlyPlan: plan });
  if (stillToSave > 0) challenges.push({ id: 'saving_comes_first', amount: stillToSave, flag: true });
  if (remaining < price * 2) challenges.push({ id: 'pay_for_it_twice', flag: true });

  if (price > headroom) {
    return { verdict: 'no', advice: 'dont', reason: 'emergency_floor', remaining, personalMonthlyPlan: plan, headroom, stillToSave, opportunity: leftAloneCost(price), challenges, sourceModule: false };
  }
  if (kind !== 'need' && stillToSave > 0) {
    return { verdict: 'wait', advice: 'save-first', reason: 'saving_not_in', remaining, personalMonthlyPlan: plan, headroom, stillToSave, opportunity: leftAloneCost(price), challenges, sourceModule: false };
  }
  if (kind !== 'need' && remaining < price) {
    return { verdict: 'yes-from-savings', advice: 'split-it', reason: 'want_uses_savings', remaining, personalMonthlyPlan: plan, headroom, stillToSave, opportunity: leftAloneCost(price), challenges, sourceModule: false };
  }
  if (kind === 'need' && remaining < price) {
    return { verdict: 'yes-from-savings', advice: 'buy', reason: 'need_above_floor', remaining, personalMonthlyPlan: plan, headroom, stillToSave, opportunity: leftAloneCost(price), challenges, sourceModule: false };
  }
  return { verdict: 'yes', advice: 'buy', remaining, personalMonthlyPlan: plan, headroom, stillToSave, opportunity: leftAloneCost(price), challenges, sourceModule: false };
}
