const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { decideSheetWrite, isInputCell } = require('../lib/forecast/sheetSync');
const { deriveAutoTasks } = require('../lib/planning/autoTasks');
const { minutesForZap, moneySaved } = require('../lib/automations/savings');

test('a sheet write waits when the cell changed, and formulas are left alone', () => {
  assert.deepEqual(decideSheetWrite({ current: '15', lastSynced: '10', stored: '10', next: '12' }).action, 'conflict');
  assert.equal(decideSheetWrite({ current: '10', lastSynced: '10', stored: '10', next: '12' }).action, 'write');
  assert.equal(decideSheetWrite({ current: '=A1+B1', lastSynced: '10', stored: '10', next: '12' }).reason, 'formula');
  assert.equal(isInputCell({ label: 'Gross Profit', kind: 'metric', sourceCell: 'B5' }), false);
  assert.equal(isInputCell({ label: 'Retained Clients', kind: 'revenue', sourceCell: 'B3' }), true);
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/cockpit_sheet_sync.sql'), 'utf8');
  assert.match(sql, /create table cockpit.sheet_write_log/);
  assert.match(sql, /create table cockpit.automation_rates/);
  assert.equal(/alter table cockpit.income_detail_lines/i.test(sql), false);
  assert.equal(/grant delete/i.test(sql), false);
});

test('an automatic task hides for this period and returns next period', () => {
  const open = deriveAutoTasks({ period: '2026-11', entries: [{ period: '2026-10' }], posts: 0, cells: [] });
  assert.equal(open.some((task) => task.taskKey === 'automations-silent'), true);
  assert.equal(open.some((task) => task.taskKey === 'jrl-month'), false);
  const hidden = deriveAutoTasks({
    period: '2026-11',
    posts: 0,
    dismissals: [{ id: 'automations-silent:2026-11' }],
  });
  assert.equal(hidden.some((task) => task.taskKey === 'automations-silent'), false);
  const next = deriveAutoTasks({ period: '2026-12', posts: 0, dismissals: [{ id: 'automations-silent:2026-11' }] });
  assert.equal(next.some((task) => task.id === 'automations-silent:2026-12'), true);
});

test('savings use a saved rate or the documented default', () => {
  assert.equal(minutesForZap('Send invoice', null).minutes, 6);
  assert.match(minutesForZap('Send invoice', null).formula, /6 minutes/);
  assert.equal(minutesForZap('Misc', 9).minutes, 9);
  const saved = moneySaved({ runs: 10, minutes: 6, hourlyRate: 50 });
  assert.equal(saved.pounds, 50);
  assert.match(saved.formula, /10 runs × 6 min/);
});
