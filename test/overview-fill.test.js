const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { incomeBreakdown, workingMonthLines } = require('../lib/planning/entries');
const { savingsFromZaps } = require('../lib/automations/savings');
const { incomeYear, clientsForSegment, segmentLines, retainersEnding, retainersHaveEndDates, clientSavings } = require('../lib/cockpit/overview');

const rows = [
  { label: 'Retained Clients', kind: 'revenue', rowNumber: 3, cells: { '2026-01': { minor: 800000, blank: false }, '2026-11': { minor: 1000000, blank: false } } },
  { label: 'Project Work', kind: 'revenue', rowNumber: 4, cells: { '2026-11': { minor: 430000, blank: false } } },
  { label: 'Zapier', kind: 'cost', rowNumber: 16, group: { groupId: 'administration', sourceConfirmed: true }, cells: { '2026-11': { minor: 618040, blank: false } } },
];

test('the overview year uses the same retainer and project split as Toki', () => {
  const series = incomeYear(rows, [], '2026', { months: { '2026-11': { billing: 900000 } } });
  assert.deepEqual(series.map((month) => month.label), ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
  const november = series.find((month) => month.id === '2026-11');
  const split = incomeBreakdown(workingMonthLines(rows, [], '2026-11'));
  assert.equal(november.retainer, split.retainer);
  assert.equal(november.project, split.project);
  assert.equal(november.total, split.total);
  assert.equal(november.total, 1430000);
  assert.equal(november.actual, 900000);
});

test('a segment lists only the clients of that kind', () => {
  const details = [
    { id: 'louise', kind: 'retainer', party: 'Louise', amountMinor: 240000, firstPaymentMonth: '2026-01', contractEndDate: '2026-12-31' },
    { id: 'harbour', kind: 'project', party: 'Harbour', amountMinor: 430000, firstPaymentMonth: '2026-11', totalPayments: 1 },
  ];
  assert.deepEqual(clientsForSegment(details, 'retainer', '2026-11').map((row) => row.name), ['Louise']);
  assert.deepEqual(clientsForSegment(details, 'project', '2026-11').map((row) => row.name), ['Harbour']);
  assert.deepEqual(clientsForSegment(details, 'project', '2026-12'), []);
});

test('observed months match the segment and the bar gap stays visible', () => {
  const retainers = Array.from({ length: 12 }, (_, index) => ({
    id: `r${index}`,
    kind: 'retainer',
    party: `Retainer ${index + 1}`,
    amountMinor: index === 0 ? 882350 - (11 * 70000) : 70000,
    observedMonth: '2026-11',
  }));
  const projects = [200000, 150000, 100000, 90000].map((amountMinor, index) => ({
    id: `p${index}`,
    kind: 'project',
    party: `Project ${index + 1}`,
    amountMinor,
    observedMonth: '2026-11',
  }));
  const retainerLines = segmentLines(retainers, 'retainer', '2026-11', 890000);
  const projectLines = segmentLines(projects, 'project', '2026-11', 540000);
  assert.equal(retainerLines.filter((row) => row.name !== 'Unattributed').length, 12);
  assert.equal(retainerLines.find((row) => row.name === 'Unattributed').minor, 890000 - 882350);
  assert.equal(projectLines.length, 4);
  assert.equal(projectLines.some((row) => row.name === 'Unattributed'), false);
  assert.equal(retainersHaveEndDates(retainers), false);
});

test('retainers ending stays inside the next three months', () => {
  const details = [
    { kind: 'retainer', party: 'Soon', contractEndDate: '2026-12-15' },
    { kind: 'retainer', party: 'Later', contractEndDate: '2027-06-01' },
    { kind: 'project', party: 'Not a retainer', contractEndDate: '2026-12-01' },
  ];
  assert.deepEqual(retainersEnding(details, new Date('2026-11-09T00:00:00Z'), 3).map((row) => row.party), ['Soon']);
});

test('overview client hours match the automations per-zap total', () => {
  const zaps = [
    { zapId: 'invoice', title: 'Send invoice', account: 'Louise', runs: 10 },
    { zapId: 'email', title: 'Send email', account: 'Louise', runs: 5 },
    { zapId: 'other', title: 'Send quote', account: 'Northwind', runs: 2 },
  ];
  const rates = [{ id: 'client:Louise', hourlyRateMinor: 6000 }];
  const clients = clientSavings(zaps, rates);
  const total = savingsFromZaps(zaps, rates);
  assert.equal(clients.reduce((sum, client) => sum + client.pounds, 0), total.pounds);
  assert.equal(clients.reduce((sum, client) => sum + client.hours, 0), total.hours);
  assert.equal(clients[0].name, 'Louise');
});

test('overview loads JRL and Automations on mount and paints client bars', () => {
  const app = fs.readFileSync(require('node:path').join(__dirname, '../app/cockpit/ui/App.js'), 'utf8');
  const screen = fs.readFileSync(require('node:path').join(__dirname, '../app/cockpit/ui/OverviewScreen.js'), 'utf8');
  const css = fs.readFileSync(require('node:path').join(__dirname, '../app/cockpit/cockpit.css'), 'utf8');
  assert.equal(app.includes("area !== 'jrl'"), false);
  assert.equal(app.includes("area !== 'automations'"), false);
  assert.match(app, /fetch\('\/api\/cockpit\/jrl'\)/);
  assert.match(app, /fetch\('\/api\/cockpit\/automations'\)/);
  assert.match(app, /jrlLoading=\{jrlLoading\}/);
  assert.match(app, /runsLoading=\{runsLoading\}/);
  assert.match(screen, /Loading client time/);
  assert.match(screen, /spark empty ov-spark/);
  assert.match(css, /\.overview-card \.ov-client i\[data-state="value"\] \{ background: #171717; \}/);
  assert.match(css, /\.overview-card \.ov-spark \{ flex: 0 0 132px; height: 132px;/);
  assert.match(css, /\.ov-tile b \{[^}]*font-size: 17px/);
  assert.match(css, /\.overview-card \.ov-income \.ov-x \{[^}]*font-size: 12px/);
  assert.equal(css.includes('writing-mode: vertical-rl'), false);
  assert.match(css, /\.overview-card \.ov-chart:not\(\.ov-income\) \.ov-x \{[^}]*text-overflow: ellipsis/);
  assert.equal(css.includes('@container (max-width: 30px)'), false);
  assert.match(css, /\.overview-card \.ov-income \.ov-plot \{[^}]*min-height: 148px/);
  assert.equal(/\.ov-tile \{[^}]*aspect-ratio/.test(css), false);
});
