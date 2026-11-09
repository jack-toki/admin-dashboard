const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parsePipelinePlan, pipelineView, preparePipelineWrite } = require('../lib/forecast/pipelinePlan');

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
  const line = plan.rows.find((row) => row.label === 'Like Zero');
  assert.equal(line.cells[0].input, true);
  assert.equal(line.cells[0].minor, null);
  const total = plan.rows.find((row) => row.label === 'TOTAL');
  assert.equal(total.cells[1].formula, true);
  assert.equal(total.cells[1].input, false);
  assert.equal(view.series[1].values[1].value, 4000);
  assert.equal(view.series[1].values[0].value, 0);
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
  const route = fs.readFileSync(path.join(__dirname, '../app/api/cockpit/forecast-plan/route.js'), 'utf8');
  assert.equal(route.includes('SHEET_CSV_URL'), false);
  assert.equal(route.includes('googleapis'), false);
});
