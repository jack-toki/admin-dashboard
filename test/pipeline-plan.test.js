const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parsePipelinePlan, pipelineView, pipelineStack, preparePipelineWrite, pipelineInputEdit } = require('../lib/forecast/pipelinePlan');

const values = [
  [],
  ['', 'Source', 'What We Are Doing', 'TOTAL', 'Aug-26', 'Sep-26'],
  ['Target', '', '', 12000, 6000, 6000],
  ['Active', '', '', 8030, 4000, 4030],
  ['75% High Side - Waiting for approval', '', '', 12000, '', ''],
  ['', '', '', 'TOTAL', 0, 4000],
  ['Like Zero', 'ClickUp PP', 'ClickUp Build', 12000, '', 4000],
];
const formulas = [
  [],
  [],
  ['', '', '', '=SUM(E3:F3)', '6000', '6000'],
  ['', '', '', '=SUM(E4:F4)', '=SUM(E11:E30)', '=SUM(F11:F30)'],
  ['', '', '', '=SUM(D6:D6)', '', ''],
  ['', '', '', 'TOTAL', '=SUM(E6:E6)', '=SUM(F6:F6)'],
  ['', '', '', '=SUM(E7:F7)', '0', '4000'],
];

test('the pipeline plan keeps the Sheet labels and leaves formulas read-only', () => {
  const plan = parsePipelinePlan(values, formulas);
  assert.equal(plan.tab, 'Pipeline Forecast V2');
  assert.deepEqual(plan.months, ['Aug-26', 'Sep-26']);
  assert.deepEqual(plan.rows.map((row) => row.label), ['Target', 'Active', '75% High Side - Waiting for approval', 'TOTAL', 'Like Zero']);
  const target = plan.rows[0].cells[0];
  assert.equal(target.input, true);
  assert.equal(target.a1, 'E3');
  const active = plan.rows[1].cells[0];
  assert.equal(active.formula, true);
  assert.equal(active.input, false);
  const view = pipelineView(plan);
  assert.equal(view.series[0].label, 'Active');
  assert.equal(view.series[0].kind, 'history');
  assert.equal(view.series[1].label, '75% High Side - Waiting for approval');
  assert.equal(view.series[1].kind, 'forecast');
  assert.equal(view.tiles.find((tile) => tile.label.startsWith('75%')).minor, 1200000);
  assert.equal(preparePipelineWrite(active, { current: '4000', stored: '4000', next: 500000 }).action, 'skip');
  assert.equal(preparePipelineWrite(target, { current: '6000', stored: '6000', next: 650000 }).action, 'write');
  assert.equal(preparePipelineWrite(target, { current: '8000', stored: '6000', next: 650000 }).action, 'conflict');
  assert.deepEqual(pipelineInputEdit(null, ''), { action: 'skip', reason: 'blank' });
  assert.deepEqual(pipelineInputEdit(null, '   '), { action: 'skip', reason: 'blank' });
  const cleared = pipelineInputEdit(400000, '');
  assert.equal(cleared.action, 'clear');
  assert.equal(cleared.next, '');
  assert.notEqual(cleared.next, 0);
  assert.notEqual(cleared.next, '0');
  assert.equal(pipelineInputEdit(400000, '4000').action, 'skip');
  assert.equal(pipelineInputEdit(null, '0').action, 'save');
  assert.equal(pipelineInputEdit(null, '0').minor, 0);
  const blankCell = { ...target, minor: null };
  assert.equal(preparePipelineWrite(blankCell, { current: '', stored: '', next: 0, clear: true }).action, 'skip');
  const clearedWrite = preparePipelineWrite(target, { current: '4000', stored: '4000', next: '', clear: true });
  assert.equal(clearedWrite.action, 'write');
  assert.equal(clearedWrite.next, '');
  const line = plan.rows.find((row) => row.label === 'Like Zero');
  assert.equal(line.cells[0].input, true);
  assert.equal(line.cells[0].minor, null);
  const total = plan.rows.find((row) => row.label === 'TOTAL');
  assert.equal(total.cells[1].formula, true);
  assert.equal(total.cells[1].input, false);
  assert.equal(view.series[1].values[1].value, 4000);
  assert.equal(view.series[1].values[0].value, 0);
});

test('the forecast stack uses section headers for actual and potential', () => {
  const values = [
    [],
    ['', 'Source', 'What We Are Doing', 'TOTAL', 'Dec-26', 'Jan 26'],
    ['Retainers', '', '', '', '', ''],
    ['Acme', 'Acme', 'Support', 1000, 600, 400],
    ['Projects', '', '', '', '', ''],
    ['Harbour', 'Harbour', 'Film', 500, 500, ''],
    ['75% High Side - Waiting for approval', '', '', 2000, '', ''],
    ['Like Zero', 'ClickUp', 'Build', 2000, 2000, ''],
    ['10% Low Side - Enquiry', '', '', 100, '', ''],
    ['Enquiry Co', '', '', 100, '', 100],
  ];
  const plan = parsePipelinePlan(values, values.map(() => []));
  const stack = pipelineStack(plan);
  assert.match(stack.tierField, /section header/);
  assert.deepEqual(stack.months.map((month) => month.label), ['Dec-26', 'Jan 26']);
  const december = stack.months[0];
  assert.deepEqual(december.segments.map((segment) => segment.id), [
    'actual-retainer', 'actual-project', 'potential-75', 'potential-50', 'potential-25', 'potential-10',
  ]);
  assert.equal(december.segments[0].clients[0].name, 'Acme');
  assert.equal(december.segments[0].clients[0].type, 'Retainer');
  assert.equal(december.segments[1].clients[0].type, 'Project');
  assert.equal(december.segments[2].clients[0].name, 'Like Zero');
  assert.equal(december.segments[2].clients[0].type, null);
  assert.equal(december.segments[2].minor, 200000);
  assert.equal(december.actual, 110000);
  assert.equal(december.potential, 200000);
  const january = stack.months[1];
  assert.equal(january.segments.find((segment) => segment.id === 'potential-10').clients[0].name, 'Enquiry Co');
  assert.equal(january.segments.find((segment) => segment.id === 'potential-75').minor, 0);
  const screen = fs.readFileSync(path.join(__dirname, '../app/cockpit/ui/ForecastScreen.js'), 'utf8');
  assert.match(screen, /pipelineStack/);
  assert.match(screen, /fs-seg/);
  assert.match(screen, /CursorTooltip/);
  assert.equal(screen.includes('<polyline'), false);
});

test('the overview drops the duplicate Toki tiles and the nav says Revenue Split', () => {
  const screen = fs.readFileSync(path.join(__dirname, '../app/cockpit/ui/OverviewScreen.js'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../app/cockpit/ui/App.js'), 'utf8');
  const nav = fs.readFileSync(path.join(__dirname, '../lib/nav/sidebar.js'), 'utf8');
  assert.equal(screen.includes('Next retainer'), false);
  assert.equal(screen.includes('label="Time saved"'), true);
  assert.match(nav, /Revenue Split/);
  assert.match(app, /\{view\.label\}/);
  assert.match(app, /hash === '#money'/);
  assert.match(app, />Forecast</);
  assert.match(app, /hash === '#outstanding'/);
  assert.match(screen, /label="Outstanding Tasks"/);
  assert.match(screen, /scroll: 'outstanding'/);
  assert.match(screen, /<Tile label="Outstanding"/);
  const toki = fs.readFileSync(path.join(__dirname, '../app/cockpit/ui/TokiScreen.js'), 'utf8');
  assert.match(toki, /id="outstanding"/);
  const route = fs.readFileSync(path.join(__dirname, '../app/api/cockpit/forecast-plan/route.js'), 'utf8');
  assert.equal(route.includes('SHEET_CSV_URL'), false);
  assert.equal(route.includes('googleapis'), false);
});
