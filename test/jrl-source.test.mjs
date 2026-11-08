import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { annualisedIRR, performance, BENCHMARK_RATE } from '../vendor/jrl-finance/code/lib/finance.ts';
import { monthlyRate, monthlyForTarget, monthsToTarget, projectPath } from '../vendor/jrl-finance/code/lib/targets.ts';
import { afford } from '../vendor/jrl-finance/code/lib/afford.ts';

// Calls the vendored modules from jrl-finance 1f7b5fe. That commit has no test suite.
// These checks are not a claim that a live ledger was compared.

test('the original money-weighted return is not gain divided by contributions', () => {
  const simple = ((1400 - 450) / 450);
  const irr = annualisedIRR([-150, -150, -150 + 1400]);
  assert.equal(BENCHMARK_RATE, 0.07);
  assert.notEqual(irr, simple);
  assert.equal(typeof irr, 'number');
  const perf = performance([
    { period: '2026-08-01', hl_in: 150, hl_contributed: 150, hl_value: 1000 },
    { period: '2026-10-01', hl_in: 150, hl_contributed: 450, hl_value: 1400 },
  ]);
  assert.equal(perf.earningsThisMonth, 1400 - 1000 - 150);
  assert.ok(Number.isFinite(perf.annualisedPct));
});

test('the original monthly rate compounds and the payment is never negative', () => {
  const rate = monthlyRate(0.12);
  assert.ok(Math.abs(rate - ((1.12 ** (1 / 12)) - 1)) < 1e-12);
  assert.notEqual(rate, 0.12 / 12);
  assert.equal(monthlyForTarget({ current: 1000, target: 100, annualRate: 0.07, months: 12 }), 0);
  assert.equal(monthsToTarget({ current: 0, target: 5000, monthly: 1, annualRate: 0 }), null);
  assert.equal(projectPath({ current: 10, target: 20, monthly: 1, annualRate: 0, months: 1 })[0].month, 0);
});

test('the original adviser treats savings-first as an amount', () => {
  const held = afford({
    price: 10,
    kind: 'want',
    monthlyBudget: 300,
    spentThisMonth: 0,
    savingsPot: 1000,
    emergencyFloor: 0,
    targetCommitments: 0,
    savingsFirst: 200,
    savedThisMonth: 0,
  });
  assert.equal(held.advice, 'save-first');
  assert.equal(held.savingsGap, 200);
  const need = afford({
    price: 100,
    kind: 'need',
    monthlyBudget: 0,
    spentThisMonth: 0,
    savingsPot: 200,
    emergencyFloor: 50,
    targetCommitments: 0,
    savingsFirst: 0,
    savedThisMonth: 0,
  });
  assert.equal(need.advice, 'buy');
  assert.equal(need.verdict, 'yes-from-savings');
});

test('the ledger view stays security invoker and does not invent the first earnings figure', () => {
  const sql = fs.readFileSync(new URL('../vendor/jrl-finance/code/supabase/migrations/0001_init.sql', import.meta.url), 'utf8');
  assert.match(sql, /security_invoker = on/);
  assert.match(sql, /lag\(obs_value\) over \(order by period\) is not null/);
  assert.doesNotMatch(sql, /service_role/);
});
