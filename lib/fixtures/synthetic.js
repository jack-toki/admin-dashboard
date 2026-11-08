// SYNTHETIC FIXTURE. Not the forecast workbook, not a client, not a Zap export.

export const SYNTHETIC_BANNER = 'SYNTHETIC FIXTURE — not live Toki, We Are Louise, client, or personal data.';

export function syntheticBaseline() {
  const months = [...Array.from({ length: 12 }, (_, index) => `2026-${String(index + 1).padStart(2, '0')}`), '2027-01'];
  const headers = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January 2027'];
  const cell = (values) => Object.fromEntries(months.map((month, index) => [month, values[index] == null ? { minor: null, blank: true } : { minor: values[index], blank: false }]));
  const across = (value) => months.map(() => value);
  return {
    synthetic: true,
    title: 'Forecast Profit & Loss',
    sheetId: 1455407915,
    sourceVersion: 'forecast-profit-and-loss',
    months: months.map((key, index) => ({ key, header: headers[index] })),
    rows: [
      { rowNumber: 3, label: 'Retained Clients', kind: 'revenue', group: { groupId: 'billing', provenance: 'source', sourceConfirmed: true }, cells: cell(across(10000).map((value, index) => (index === 12 ? 8000 : value))) },
      { rowNumber: 4, label: 'Project Work', kind: 'revenue', group: { groupId: 'billing', provenance: 'source', sourceConfirmed: true }, cells: cell(across(4000).map((value, index) => (index === 1 ? -2000 : index === 12 ? null : value))) },
      { rowNumber: 5, label: 'Gross Profit', kind: 'metric', cells: cell(across(14000).map((value, index) => (index === 1 ? -2000 : index === 12 ? 8000 : value))) },
      { rowNumber: 9, label: 'Example Tool', kind: 'cost', group: { groupId: 'administration', provenance: 'source', sourceConfirmed: true }, cells: cell(across(1000)) },
      { rowNumber: 10, label: 'Cursor', kind: 'cost', group: { groupId: 'administration', provenance: 'suggested', sourceConfirmed: false }, cells: cell(across(500).map((value, index) => (index === 0 ? null : value))) },
      { rowNumber: 35, label: 'Monthly Cost', kind: 'metric', cells: cell(across(1500).map((value, index) => (index === 0 ? 1000 : value))) },
      { rowNumber: 37, label: 'Jack Salary', kind: 'metric', group: { groupId: 'people', provenance: 'source', sourceConfirmed: true }, cells: cell(across(3000)) },
    ],
    anomaly: {
      code: 'monthly_cost_range_differs',
      message: 'Example only: January 2027 formula omits earlier cost rows. The sheet figure is not replaced.',
      omittedFrom: [{ key: '2027-01', omittedRows: [9, 10, 11] }],
    },
    grossProfitMeaning: 'Gross Profit here means the billing sum, not profit after costs.',
  };
}

export function syntheticPipeline() {
  return [
    { leadId: 'example-lead-1', label: 'Example prospect', status: 'Proposal', amountMinor: 240000, probability: null },
    { leadId: 'example-lead-2', label: 'Example retainer', status: 'Meeting booked', amountMinor: 80000, probability: null },
  ];
}

export function syntheticContacts() {
  return [
    { leadId: 'example-lead-1', label: 'Example prospect', email: 'ada@example.com', evidence: 'calendar', priorKnowledge: 'unknown', historyComplete: false },
    { leadId: 'example-lead-3', label: 'Another person, same firm', email: 'grace@example.com', evidence: 'none', priorKnowledge: 'unknown', historyComplete: false },
  ];
}

export function syntheticFacts() {
  return [
    { text: 'One example prospect is at proposal. Probability was not stated.', evidence: 'example-lead-1', period: 'Example week' },
  ];
}

export function syntheticWorkflows() {
  return [
    { accountSlug: 'example-client', zapId: 'example-zap-1', title: 'Example workflow' },
    { accountSlug: 'example-client', zapId: 'example-zap-2', title: 'Example with no events' },
  ];
}

export function syntheticEvents() {
  return [
    { accountSlug: 'example-client', zapId: 'example-zap-1', eventId: 'example-event-1', runId: 'example-run-1', stageId: 'start', status: 'success', occurredAt: '2026-11-01T09:00:00Z' },
    { accountSlug: 'example-client', zapId: 'example-zap-1', eventId: 'example-event-2', runId: 'example-run-1', stageId: 'finish', status: 'success', occurredAt: '2026-11-01T09:01:00Z' },
    { accountSlug: 'example-client', zapId: 'example-zap-1', eventId: 'example-event-3', status: 'success', occurredAt: '2026-11-02T09:00:00Z' },
  ];
}

const DASHBOARD_MONTHS = [...Array.from({ length: 12 }, (_, index) => `2026-${String(index + 1).padStart(2, '0')}`), '2027-01'];

function dashboardCells(values) {
  return Object.fromEntries(DASHBOARD_MONTHS.map((month, index) => [month, values[index] == null ? { minor: null, blank: true } : { minor: values[index], blank: false }]));
}

export function syntheticDashboard() {
  return {
    synthetic: true,
    title: 'Example forecast',
    sheetId: 1455407915,
    sourceVersion: 'labelled-dashboard-fixture',
    months: DASHBOARD_MONTHS.map((key, index) => ({ key, header: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January 2027'][index] })),
    rows: [
      { rowNumber: 3, label: 'Retained Clients', kind: 'revenue', group: { groupId: 'billing', provenance: 'source', sourceConfirmed: true }, cells: dashboardCells([1850000, 1850000, 2100000, null, 2400000, 2400000, 2400000, 2200000, null, 2600000, 2850000, 3100000, 1900000]) },
      { rowNumber: 4, label: 'Project Work', kind: 'revenue', group: { groupId: 'billing', provenance: 'source', sourceConfirmed: true }, cells: dashboardCells([6200000, 0, 4800000, null, 9100000, 5400000, 7300000, 1500000, 8800000, null, 4200000, 6700000, null]) },
      { rowNumber: 9, label: 'Example software subscriptions', kind: 'cost', group: { groupId: 'administration', provenance: 'source', sourceConfirmed: true }, cells: dashboardCells([240000, 260000, 310000, 280000, 460000, 680000, 420000, 390000, 510000, 330000, 470000, 610000, 300000]) },
      { rowNumber: 11, label: 'Example studio rent', kind: 'cost', group: { groupId: 'premises', provenance: 'source', sourceConfirmed: true }, cells: dashboardCells([450000, 450000, 450000, 450000, 450000, 0, 450000, 450000, 450000, 450000, 450000, 450000, 450000]) },
      { rowNumber: 14, label: 'Example payroll and pensions', kind: 'cost', group: { groupId: 'people', provenance: 'source', sourceConfirmed: true }, cells: dashboardCells([1200000, 1200000, 1350000, 1350000, 1480000, 1600000, 1600000, 1720000, 1720000, 1800000, 1800000, 1800000, 1500000]) },
      { rowNumber: 18, label: 'Example bank and card fees', kind: 'cost', group: { groupId: 'finance', provenance: 'source', sourceConfirmed: true }, cells: dashboardCells([18000, 22000, null, 41000, 36000, null, 28000, 24000, 33000, 47000, 52000, 61000, 20000]) },
      { rowNumber: 21, label: 'Example travel and entertainment', kind: 'cost', group: { groupId: 'selling', provenance: 'source', sourceConfirmed: true }, cells: dashboardCells([120000, 180000, 260000, 840000, 410000, 390000, 220000, 310000, 540000, 160000, 430000, 760000, 140000]) },
      { rowNumber: 24, label: 'Example contractor', kind: 'cost', group: { groupId: null, provenance: 'suggested', sourceConfirmed: false }, cells: dashboardCells([80000, 80000, null, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, 80000, null]) },
    ],
    grossProfitMeaning: 'Gross Profit here means the billing sum, not profit after costs.',
  };
}

export function syntheticDashboardActuals() {
  return {
    synthetic: true,
    basis: 'unknown',
    vat: 'unknown',
    peopleKnown: false,
    months: {
      '2026-01': { coverage: 'full', billing: 7200000, administration: 200000, people: null, premises: 450000, finance: 18000, selling: 90000 },
      '2026-02': { coverage: 'full', billing: 0, administration: 260000, people: null, premises: 450000, finance: 22000, selling: 0 },
      '2026-08': { coverage: 'partial', billing: null, administration: 100000, people: null },
      '2026-09': { coverage: 'missing' },
      '2026-11': { coverage: 'full', billing: 6400000, administration: 400000, people: null, premises: 450000, finance: 52000, selling: 300000 },
    },
  };
}

export function syntheticActuals() {
  return {
    synthetic: true,
    basis: 'unknown',
    vat: 'unknown',
    peopleKnown: false,
    months: {
      '2026-01': { coverage: 'full', billing: 12000, administration: 800, people: null },
      '2026-08': { coverage: 'partial', billing: null, administration: 100, people: null },
    },
  };
}
