const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { deriveAutoTasks, openOutstandingItems, currentTokiMonth } = require('../lib/planning/autoTasks');

test('the Outstanding Tasks tile counts the same open items as the list', () => {
  assert.equal(currentTokiMonth(new Date('2026-11-09T12:00:00Z')), '2026-11');
  assert.notEqual(currentTokiMonth(new Date('2026-11-09T12:00:00Z')), '2026-01');
  const cells = [
    { label: 'Retained Clients', kind: 'revenue', rowNumber: 3, month: '2026-11', enteredMinor: null, nullState: 'blank' },
    { label: 'Retained Clients', kind: 'revenue', rowNumber: 3, month: '2026-10', enteredMinor: 100, nullState: 'amount' },
    { label: 'Project Work', kind: 'revenue', rowNumber: 4, month: '2026-11', enteredMinor: null, nullState: 'blank' },
    { label: 'Project Work', kind: 'revenue', rowNumber: 4, month: '2026-10', enteredMinor: 50, nullState: 'amount' },
  ];
  const auto = deriveAutoTasks({
    period: currentTokiMonth(new Date('2026-11-09T12:00:00Z')),
    cells,
    entries: [{ period: '2026-08-01' }],
    posts: 4,
    dismissals: [],
  });
  const outstanding = [
    { id: 'open', title: 'Send the invoice', doneAt: null },
    { id: 'done', title: 'Already done', doneAt: '2026-02-01' },
  ];
  const list = openOutstandingItems(outstanding, auto);
  assert.deepEqual(list.map((item) => item.title), [
    'Send the invoice',
    '2 forecast inputs missing in 2026-11',
    'JRL ledger has no 2026-10 entry',
  ]);
  assert.equal(list.length, 3);

  const dismissed = deriveAutoTasks({
    period: '2026-11',
    cells,
    entries: [{ period: '2026-08-01' }],
    posts: 4,
    dismissals: [{ id: 'jrl-month:2026-11' }],
  });
  const afterDismiss = openOutstandingItems(outstanding, dismissed);
  assert.equal(afterDismiss.some((item) => item.title.includes('JRL ledger')), false);
  assert.equal(afterDismiss.length, list.length - 1);

  const screen = fs.readFileSync(path.join(__dirname, '../app/cockpit/ui/OverviewScreen.js'), 'utf8');
  const toki = fs.readFileSync(path.join(__dirname, '../app/cockpit/ui/TokiScreen.js'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../app/cockpit/ui/App.js'), 'utf8');
  assert.match(screen, /openOutstandingItems\(outstanding, auto\)\.length/);
  assert.match(toki, /openOutstandingItems\(outstanding, autoTasks\)/);
  assert.match(app, /period: currentTokiMonth\(\)/);
  assert.match(toki, /useState\(\(\) => currentTokiMonth\(\)\)/);
});
