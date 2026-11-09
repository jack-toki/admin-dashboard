const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AUTOMATION_RANGES, rangeWindow } = require('../lib/automations/range');

test('automation ranges use London midnights and the monitoring presets', () => {
  assert.deepEqual(AUTOMATION_RANGES.map(([, id]) => id), [
    'today', 'yesterday', 'this-week', 'last-7-days', 'last-week',
    'this-month', 'last-month', 'last-30-days', '90-days', 'all-time',
  ]);
  const winter = new Date('2026-11-09T15:00:00Z');
  const yesterday = rangeWindow('yesterday', winter);
  assert.equal(yesterday.from.toISOString(), '2026-11-08T00:00:00.000Z');
  assert.equal(yesterday.to.toISOString(), '2026-11-09T00:00:00.000Z');
  const lastWeek = rangeWindow('last-week', winter);
  assert.equal(lastWeek.from.toISOString(), '2026-11-02T00:00:00.000Z');
  assert.equal(lastWeek.to.toISOString(), '2026-11-09T00:00:00.000Z');
  const month = rangeWindow('this-month', winter);
  assert.equal(month.from.toISOString(), '2026-11-01T00:00:00.000Z');
  assert.equal(month.to.toISOString(), winter.toISOString());
  const summer = rangeWindow('today', new Date('2026-07-15T12:00:00.000Z'));
  assert.equal(summer.from.toISOString(), '2026-07-14T23:00:00.000Z');
  assert.equal(rangeWindow('not-a-range', winter).id, 'this-month');

  const screen = fs.readFileSync(path.join(__dirname, '../app/cockpit/ui/TokiScreen.js'), 'utf8');
  assert.match(screen, /AUTOMATION_RANGES/);
  assert.match(screen, /params\.set\('range'/);
  assert.match(screen, /No runs in/);
  assert.equal(screen.includes('Ingest slug'), false);
  assert.equal(screen.includes('Zap id'), false);
  assert.match(screen, /Tracking key/);
  assert.match(screen, /Zap reference/);
  const board = fs.readFileSync(path.join(__dirname, '../app/cockpit/ui/IncomeBoard.js'), 'utf8');
  assert.match(board, /stopPropagation/);
  assert.match(board, /Contract end/);
  assert.match(board, /type="date"/);
  assert.equal(board.includes('>Schedule<'), false);
  assert.match(board, /Payment number/);
});
