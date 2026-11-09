const test = require('node:test');
const assert = require('node:assert/strict');
const { incomeBreakdown, workingMonthLines } = require('../lib/planning/entries');
const { savingsFromZaps } = require('../lib/automations/savings');
const { incomeYear, clientsForSegment, retainersEnding, clientSavings } = require('../lib/cockpit/overview');

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
