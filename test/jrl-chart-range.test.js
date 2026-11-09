const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { applyRange, yearOverlay, stateAnnualRate, futureValue, forecastSeries, forecastRate } = require('../lib/jrl/chartRange');

const rows = [
  { period: '2025-11-01', chase_total: 100 },
  { period: '2025-12-01', chase_total: 120 },
  { period: '2026-01-01', chase_total: 140 },
  { period: '2026-08-01', chase_total: 200 },
];

test('a date range filters the view and leaves the stored rows in place', () => {
  const all = applyRange(rows, { preset: 'all' }, new Date('2026-11-09T00:00:00Z'));
  assert.equal(all.rows.length, 4);
  assert.equal(all.sourceCount, 4);
  assert.equal(rows.length, 4);
  const year = applyRange(rows, { preset: 'year', year: 2026 }, new Date('2026-11-09T00:00:00Z'));
  assert.deepEqual(year.rows.map((row) => row.period), ['2026-01-01', '2026-08-01']);
  const last = applyRange(rows, { preset: 'last' }, new Date('2026-11-09T00:00:00Z'));
  assert.deepEqual(last.rows.map((row) => row.period), []);
  const august = applyRange(rows, { preset: 'last' }, new Date('2026-09-02T00:00:00Z'));
  assert.deepEqual(august.rows.map((row) => row.period), ['2026-08-01']);
  const custom = applyRange(rows, { preset: 'custom', from: '2025-12', to: '2026-01' });
  assert.deepEqual(custom.rows.map((row) => row.period), ['2025-12-01', '2026-01-01']);
  assert.equal(rows.length, 4);
});

test('year overlay keeps one line per year on a Jan to Dec axis', () => {
  const overlay = yearOverlay(rows, (row) => row.chase_total);
  assert.deepEqual(overlay.points.map((point) => point.label), ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
  assert.deepEqual(overlay.series.map((item) => item.id), ['2025', '2026']);
  assert.equal(overlay.series[0].values.find((point) => point.id === '11').value, 100);
  assert.equal(overlay.series[0].values.find((point) => point.id === '01').value, null);
  assert.equal(overlay.series[1].values.find((point) => point.id === '08').value, 200);
});

test('forecast growth uses the tracked state rate and keeps the short-history caveat', () => {
  const rate = stateAnnualRate({ current: 1100, contributed: 1000, months: 12 });
  assert.ok(rate > 0.09 && rate < 0.11);
  const flat = futureValue({ current: 1000, annualRate: 0, years: 2, monthlyAdd: 0 });
  assert.equal(Math.round(flat), 1000);
  const added = futureValue({ current: 1000, annualRate: 0, years: 1, monthlyAdd: 200 });
  assert.equal(Math.round(added), 3400);
  const chart = forecastSeries({
    history: [{ id: '2026-08-01', label: '2026-08', value: 1000 }],
    current: 1000,
    annualRate: rate,
    monthsOfHistory: 3,
    overlays: [
      { id: 'none', label: 'No new money', monthly: 0, on: true },
      { id: 'm200', label: '+£200/month', monthly: 200, on: true },
      { id: 'm500', label: '+£500/month', monthly: 500, on: false },
    ],
  });
  assert.equal(chart.caveat, true);
  assert.equal(chart.series.find((item) => item.id === 'm500'), undefined);
  const none = chart.series.find((item) => item.id === 'none');
  const plus = chart.series.find((item) => item.id === 'm200');
  const at20 = (series) => series.values.find((point) => point.id === 'y-20').value;
  assert.ok(at20(plus) > at20(none));
  assert.equal(chart.series[0].kind, 'history');
  assert.equal(none.kind, 'forecast');
  assert.equal(forecastRate(rate, 3).benchmark, true);
  assert.equal(forecastRate(rate, 3).rate, 0.07);
  assert.equal(forecastRate(rate, 12).benchmark, false);
});

test('the JRL page drops the session bar, Sora tab, and full-width projection bars', () => {
  const screen = fs.readFileSync(path.join(__dirname, '../app/cockpit/ui/JrlScreen.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../app/cockpit/cockpit.css'), 'utf8');
  assert.equal(screen.includes("['sora', 'Sora', 'Sora']"), false);
  assert.equal(screen.includes('ledger session expires'), false);
  assert.equal(screen.includes('className="prow"'), false);
  assert.match(screen, /x-cockpit-link/);
  assert.match(screen, /Year overlay/);
  assert.match(screen, /Last month/);
  assert.match(css, /\.chart-tip \{[^}]*position: absolute/);
});
