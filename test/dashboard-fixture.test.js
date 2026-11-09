const test = require('node:test');
const assert = require('node:assert/strict');
const { syntheticDashboard, syntheticDashboardActuals, SYNTHETIC_BANNER } = require('../lib/fixtures/synthetic');
const { previewFixtureEnabled } = require('../lib/cockpit/preview');
const { workingMonthLines, sumLines, incomeBreakdown } = require('../lib/planning/entries');

test('example dashboard data varies, keeps zero and missing distinct, and stays synthetic', () => {
  const baseline = syntheticDashboard();
  const actuals = syntheticDashboardActuals();
  assert.equal(baseline.synthetic, true);
  assert.equal(actuals.synthetic, true);
  assert.match(SYNTHETIC_BANNER, /SYNTHETIC FIXTURE/);
  assert.equal(sumLines(workingMonthLines(baseline.rows, [], '2026-04'), 'sale'), null);
  const february = workingMonthLines(baseline.rows, [], '2026-02');
  assert.equal(february.find((line) => line.party === 'Project Work').minor, 0);
  assert.equal(workingMonthLines(baseline.rows, [], '2026-06').find((line) => line.groupId === 'premises').minor, 0);
  assert.equal(workingMonthLines(baseline.rows, [], '2026-03').find((line) => line.groupId === 'finance').minor, null);
  const january = sumLines(workingMonthLines(baseline.rows, [], '2026-01'), 'sale');
  const november = sumLines(workingMonthLines(baseline.rows, [], '2026-11'), 'sale');
  assert.notEqual(january, november);
  assert.ok(january > 100000);
  assert.ok(november > 100000);
  assert.equal(actuals.months['2026-02'].billing, 0);
  assert.equal(actuals.months['2026-08'].billing, null);
  assert.equal(actuals.months['2026-09'].coverage, 'missing');
  assert.ok(baseline.rows.some((row) => row.label.length > 24));
  const novemberSplit = incomeBreakdown(workingMonthLines(baseline.rows, [], '2026-11'));
  assert.equal(novemberSplit.retainer, 2850000);
  assert.equal(novemberSplit.project, 4200000);
  assert.equal(novemberSplit.unallocated, 750000);
  assert.equal(novemberSplit.total, novemberSplit.retainer + novemberSplit.project + novemberSplit.unallocated);
  assert.equal(november, novemberSplit.total);
  assert.equal(novemberSplit.lines.find((line) => line.name === 'Retained Clients').aggregate, true);
  assert.equal(novemberSplit.lines.find((line) => line.name === 'Example workshop').type, 'unallocated');
  assert.equal(novemberSplit.lines.find((line) => line.name === 'Example workshop').aggregate, false);
  const april = incomeBreakdown(workingMonthLines(baseline.rows, [], '2026-04'));
  assert.equal(april.total, null);
  assert.equal(april.retainer, null);
  assert.equal(april.project, null);
  assert.equal(april.unallocated, null);
  const februarySplit = incomeBreakdown(february);
  assert.equal(februarySplit.project, 0);
  assert.equal(februarySplit.unallocated, null);
  const withManual = incomeBreakdown(workingMonthLines(baseline.rows, [{
    id: 'plan-example', kind: 'sale', amountMinor: 10000, currency: 'GBP', month: '2026-11', party: 'Example client North', groupId: 'billing', timing: 'one_off', attestation: 'forecast', stage: 'retainer',
  }], '2026-11'));
  assert.equal(withManual.retainer, 2850000 + 10000);
  assert.equal(withManual.lines.find((line) => line.name === 'Example client North').aggregate, false);
  assert.equal(withManual.lines.find((line) => line.name === 'Example client North').type, 'retainer');
});

test('production ignores the preview fixture flag', () => {
  assert.equal(previewFixtureEnabled({ NODE_ENV: 'production', COCKPIT_PREVIEW_FIXTURE: '1' }), false);
  assert.equal(previewFixtureEnabled({ NODE_ENV: 'development', COCKPIT_PREVIEW_FIXTURE: '1' }), true);
  assert.equal(previewFixtureEnabled({ NODE_ENV: 'development', COCKPIT_PREVIEW_FIXTURE: '0' }), false);
});
