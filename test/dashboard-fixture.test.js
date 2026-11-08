const test = require('node:test');
const assert = require('node:assert/strict');
const { syntheticDashboard, syntheticDashboardActuals, SYNTHETIC_BANNER } = require('../lib/fixtures/synthetic');
const { workingMonthLines, sumLines } = require('../lib/planning/entries');

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
});
