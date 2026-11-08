const test = require('node:test');
const assert = require('node:assert/strict');
const { blankPotRecord, latestPortfolioValue, normalisePotRecord, potViews, contributionsAreNotValuation, DEFAULT_POT_TARGET } = require('../lib/jrl/pots');

test('four pots keep a placeholder target and do not invent balances', () => {
  const views = potViews(blankPotRecord(), []);
  assert.deepEqual(views.map((pot) => pot.label), ['Lifestyle', 'Short-term savings', 'Emergency fund', 'Long-term investments']);
  for (const pot of views) {
    assert.equal(pot.target, DEFAULT_POT_TARGET);
    assert.equal(pot.balance, null);
    assert.equal(pot.known, false);
    assert.equal(pot.percent, null);
    assert.equal(pot.reconciled, false);
  }
});

test('a zero balance is known and a missing balance is not a percent', () => {
  const saved = normalisePotRecord({ targets: { emergency: 10000 }, manual: { emergency: { amount: 0, asOf: '2026-11-01' } } });
  const emergency = potViews(saved.record, []).find((pot) => pot.id === 'emergency');
  assert.equal(emergency.zero, true);
  assert.equal(emergency.known, true);
  assert.equal(emergency.percent, 0);
  assert.equal(emergency.manual, true);
  const lifestyle = potViews(saved.record, []).find((pot) => pot.id === 'lifestyle');
  assert.equal(lifestyle.known, false);
  assert.equal(lifestyle.percent, null);
});

test('progress caps at the target and still reports the amount over it', () => {
  const saved = normalisePotRecord({ manual: { short_term: { amount: 12500, asOf: '2026-11-02' } } });
  const pot = potViews(saved.record, []).find((item) => item.id === 'short_term');
  assert.equal(pot.progress, 1);
  assert.equal(pot.percent, 125);
  assert.equal(pot.over, 2500);
  assert.equal(pot.remaining, 0);
  const under = potViews(normalisePotRecord({ manual: { lifestyle: { amount: 4000 } } }).record, []).find((item) => item.id === 'lifestyle');
  assert.equal(under.progress, 0.4);
  assert.equal(under.remaining, 6000);
  assert.equal(under.over, 0);
});

test('a target must be a positive number and a negative manual balance is refused', () => {
  const kept = normalisePotRecord({ targets: { lifestyle: 0, emergency: -5, short_term: 2500 } });
  assert.equal(kept.record.targets.lifestyle, 10000);
  assert.equal(kept.record.targets.emergency, 10000);
  assert.equal(kept.record.targets.short_term, 2500);
  const refused = normalisePotRecord({ manual: { emergency: { amount: -1 } } });
  assert.equal(refused.ok, false);
});

test('investments can use a dated portfolio value and never the contributions total', () => {
  const ledger = [
    { period: '2026-10-01', hl_value: null, hl_contributed: 8000 },
    { period: '2026-11-01', hl_value: 9400, hl_contributed: 9000 },
  ];
  assert.equal(contributionsAreNotValuation(ledger[0]), true);
  assert.deepEqual(latestPortfolioValue(ledger), { amount: 9400, asOf: '2026-11-01', source: 'hl_value' });
  const hidden = potViews({ ...blankPotRecord(), usePortfolioValue: false }, ledger).find((pot) => pot.id === 'investments');
  assert.equal(hidden.balance, null);
  const shown = potViews({ ...blankPotRecord(), usePortfolioValue: true }, ledger).find((pot) => pot.id === 'investments');
  assert.equal(shown.balance, 9400);
  assert.equal(shown.asOf, '2026-11-01');
  assert.equal(shown.source, 'hl_value');
  assert.notEqual(shown.balance, 9000);
  const others = potViews({ ...blankPotRecord(), usePortfolioValue: true }, ledger).filter((pot) => pot.id !== 'investments');
  assert.ok(others.every((pot) => pot.balance == null));
});

test('a savings total is not copied into the emergency fund or short-term savings', () => {
  const ledger = [{ period: '2026-11-01', hl_value: 9400, hl_contributed: 9000, savings_total: 15000 }];
  const views = potViews({ ...blankPotRecord(), usePortfolioValue: true }, ledger);
  assert.equal(views.find((pot) => pot.id === 'emergency').balance, null);
  assert.equal(views.find((pot) => pot.id === 'short_term').balance, null);
  assert.equal(views.find((pot) => pot.id === 'lifestyle').balance, null);
});

test('a manual investment balance is not described as the portfolio reading', () => {
  const record = normalisePotRecord({
    usePortfolioValue: true,
    manual: { investments: { amount: 1000, asOf: '2026-11-03' } },
  }).record;
  const pot = potViews(record, [{ period: '2026-11-01', hl_value: 9400, hl_contributed: 9000 }]).find((item) => item.id === 'investments');
  assert.equal(pot.balance, 1000);
  assert.equal(pot.source, 'manual');
  assert.equal(pot.reconciled, false);
});
