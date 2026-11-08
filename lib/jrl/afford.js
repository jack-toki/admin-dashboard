import { BENCHMARK } from './finance.js';
import { personalMonthlyPlan } from './targets.js';

// Future income is not an input. The emergency floor is a hard stop.
// Business targets, including a business tax target, do not count as commitments.

export function leftAloneCost(amount, years = 10) {
  if (amount == null) return null;
  return amount * (1 + BENCHMARK) ** years;
}

export function advise({
  amount,
  kind = 'want',
  budget,
  spent = 0,
  emergencyFloor = 0,
  savingsFirst = true,
  savingsBalance = 0,
  targets = [],
} = {}) {
  if (budget == null || amount == null || amount === '') {
    return { verdict: null, advice: null, reason: 'needs_budget_and_price' };
  }
  const price = Number(amount);
  const plan = personalMonthlyPlan(targets);
  const remaining = Number(budget) - Number(spent);
  const savingsAfter = Number(savingsBalance) - price;
  const challenges = [];
  if (savingsAfter < Number(emergencyFloor)) {
    return {
      verdict: 'no',
      advice: 'dont',
      reason: 'emergency_floor',
      remaining,
      personalMonthlyPlan: plan,
      opportunity: leftAloneCost(price),
      challenges: [{ id: 'emergency_floor', flag: true }],
    };
  }
  if (savingsFirst && plan > 0 && remaining < plan) {
    challenges.push({ id: 'saving_comes_first', flag: true });
  }
  if (remaining < price * 2) challenges.push({ id: 'pay_for_it_twice', flag: true });
  challenges.push({ id: 'what_it_really_costs', opportunity: leftAloneCost(price) });
  if (plan > 0) challenges.push({ id: 'target_setback', personalOnly: true, monthlyPlan: plan });
  challenges.push({ id: 'this_month_so_far', spent, budget });
  if (kind === 'want') challenges.push({ id: 'sleep_on_it', flag: true });

  let verdict = 'yes';
  let advice = 'buy';
  if (savingsFirst && plan > 0 && remaining < plan + price) {
    verdict = 'wait';
    advice = 'save-first';
  } else if (remaining < price && savingsAfter >= Number(emergencyFloor)) {
    verdict = 'yes-from-savings';
    advice = 'split-it';
  } else if (kind === 'want' && remaining < price * 2) {
    verdict = 'wait';
    advice = 'sleep-on-it';
  }
  return { verdict, advice, remaining, personalMonthlyPlan: plan, opportunity: leftAloneCost(price), challenges };
}
