// SYNTHETIC FIXTURE. Not the forecast workbook, not a client, not a Zap export.

export const SYNTHETIC_BANNER = 'SYNTHETIC FIXTURE — not live Toki, We Are Louise, client, or personal data.';

export function syntheticBaseline() {
  const months = ['2026-01', '2026-02', '2027-01'];
  const cell = (values) => Object.fromEntries(months.map((month, index) => [month, values[index] == null ? { minor: null, blank: true } : { minor: values[index], blank: false }]));
  return {
    synthetic: true,
    title: 'Forecast Profit & Loss',
    sheetId: 1455407915,
    sourceVersion: 'forecast-profit-and-loss',
    months: [
      { key: '2026-01', header: 'January' },
      { key: '2026-02', header: 'February' },
      { key: '2027-01', header: 'January 2027' },
    ],
    rows: [
      { rowNumber: 3, label: 'Retained Clients', kind: 'revenue', group: { groupId: 'billing', provenance: 'source', sourceConfirmed: true }, cells: cell([10000, 0, 8000]) },
      { rowNumber: 4, label: 'Project Work', kind: 'revenue', group: { groupId: 'billing', provenance: 'source', sourceConfirmed: true }, cells: cell([4000, -2000, null]) },
      { rowNumber: 5, label: 'Gross Profit', kind: 'metric', cells: cell([14000, -2000, 8000]) },
      { rowNumber: 9, label: 'Example Tool', kind: 'cost', group: { groupId: 'administration', provenance: 'source', sourceConfirmed: true }, cells: cell([1000, 0, 1000]) },
      { rowNumber: 10, label: 'Cursor', kind: 'cost', group: { groupId: 'administration', provenance: 'suggested', sourceConfirmed: false }, cells: cell([null, 500, 500]) },
      { rowNumber: 35, label: 'Monthly Cost', kind: 'metric', cells: cell([1000, 500, 500]) },
      { rowNumber: 37, label: 'Jack Salary', kind: 'metric', group: { groupId: 'people', provenance: 'source', sourceConfirmed: true }, cells: cell([3000, 3000, 3000]) },
    ],
    anomaly: {
      code: 'monthly_cost_range_differs',
      message: 'Example only: January 2027 formula omits earlier cost rows. The sheet figure is not replaced.',
      omittedFrom: [{ key: '2027-01', omittedRows: [9, 10, 11] }],
    },
    grossProfitMeaning: 'Gross Profit here means the billing sum, not profit after costs.',
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
