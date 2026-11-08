import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { annualisedIRR, performance, projection, BENCHMARK_RATE } from '../vendor/jrl-finance/code/lib/finance.ts';
import { monthlyRate, monthsToTarget, monthlyForTarget, projectPath } from '../vendor/jrl-finance/code/lib/targets.ts';
import { afford } from '../vendor/jrl-finance/code/lib/afford.ts';
import { deriveLedger } from '../lib/jrl/finance.js';
import { monthWindow } from '../lib/jrl/months.js';

// Frozen outputs of the vendored modules at 1f7b5fe. Do not edit the modules to match a new visual.

test('golden finance, target, and adviser outputs match the original modules', () => {
  assert.equal(BENCHMARK_RATE, 0.07);
  assert.ok(Math.abs(annualisedIRR([-150, -150, 1250]) - 42334.22294419675) < 1e-6);
  const perf = performance([
    { period: '2026-08-01', hl_in: 150, hl_contributed: 150, hl_value: 1000 },
    { period: '2026-10-01', hl_in: 150, hl_contributed: 450, hl_value: 1400 },
  ]);
  assert.equal(perf.earningsThisMonth, 250);
  assert.equal(perf.verdict, 'tracking well');
  assert.ok(Math.abs(projection(1400)[0].value - 1963.5724229800005) < 1e-6);
  assert.equal(monthsToTarget({ current: 0, target: 1000, monthly: 100, annualRate: 0 }), 10);
  assert.ok(Math.abs(monthlyForTarget({ current: 0, target: 1000, annualRate: 0.045, months: 12 }) - 81.66243112081703) < 1e-9);
  assert.ok(Math.abs(monthlyRate(0.12) - 0.009488792934583046) < 1e-15);
  assert.equal(projectPath({ current: 200, target: 2000, monthly: 200, annualRate: 0.045, months: 2 })[0].month, 0);
  const advice = afford({
    price: 10, kind: 'want', monthlyBudget: 300, spentThisMonth: 0, savingsPot: 1000,
    emergencyFloor: 0, targetCommitments: 0, savingsFirst: 200, savedThisMonth: 0,
  });
  assert.equal(advice.advice, 'save-first');
  assert.equal(advice.savingsGap, 200);
});

test('periods are YYYY-MM-01 and the first supplied ISA reading has null earnings', () => {
  const window = monthWindow(new Date('2026-11-08T00:00:00Z'));
  assert.equal(window.defaultPeriod, '2026-10-01');
  const rows = deriveLedger([
    { period: '2026-08', tax_in: 100, savings_in: 200, hl_in: 150, savings_out: 0, hl_value: 1000 },
    { period: '2026-09-01', tax_in: 100, savings_in: 200, hl_in: 150, savings_out: 0, hl_value: null },
  ]);
  assert.equal(rows[0].period, '2026-08-01');
  assert.equal(rows[0].earned, null);
  assert.equal(rows[1].earned, null);
  assert.equal(rows[1].hl_carried, true);
  const sql = fs.readFileSync(new URL('../vendor/jrl-finance/code/supabase/migrations/0001_init.sql', import.meta.url), 'utf8');
  assert.match(sql, /security_invoker = on/);
  assert.match(sql, /lag\(obs_value\) over \(order by period\) is not null/);
});
