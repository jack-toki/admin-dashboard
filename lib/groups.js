// Source-backed groups from the V2 / PnL Raw labels. Amounts are not stored here.
// Cursor and Vercel are not in that source. Administration is a suggestion only.

export const GROUPS = [
  {
    id: 'billing',
    label: 'Billing / Turnover',
    kind: 'revenue',
    forecastLines: ['Retained Clients', 'Project Work'],
    actualAccounts: ['Sales'],
  },
  {
    id: 'administration',
    label: 'Administration Expenses',
    kind: 'cost',
    forecastLines: [
      'Google Workspace', 'Phone', 'Apple Storage', 'Zapier', 'ClickUp', 'Slack', 'Figma',
      'Miro', 'Claude', 'Webflow', 'Capcut', 'Xero', 'Accountants', 'Car', 'Loom', 'Granola',
      'Additional costs', 'HMRC',
    ],
    actualAccounts: [
      'Audit & Accountancy fees', 'Charitable and Political Donations', 'General Expenses',
      'IT Software and Consumables', 'Motor Vehicle Expenses', 'Printing & Stationery',
      'Subscriptions', 'Telephone & Internet',
    ],
  },
  {
    id: 'finance',
    label: 'Finance Costs',
    kind: 'cost',
    forecastLines: [],
    actualAccounts: ['Bank Fees', 'Stripe Fees'],
  },
  {
    id: 'premises',
    label: 'Premises Costs',
    kind: 'cost',
    forecastLines: ['Office'],
    actualAccounts: ['Rent'],
  },
  {
    id: 'selling',
    label: 'Selling Costs',
    kind: 'cost',
    forecastLines: [],
    actualAccounts: ['Advertising & Marketing', 'Entertainment', 'Travel & food'],
  },
  {
    id: 'people',
    label: 'People Costs',
    kind: 'cost',
    forecastLines: ['Freelancers', 'Business Coaching', 'Pension', 'Jack Salary'],
    actualAccounts: [],
    caveat: 'No people accounts are populated in the accounting export. Missing people actuals are unknown, not zero.',
  },
];

const SUGGESTED_ADMIN = new Set(['cursor', 'vercel']);

export function normLabel(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function classifyLine(label) {
  const key = normLabel(label);
  if (!key) return { groupId: 'ungrouped', provenance: 'blank', sourceConfirmed: false, kind: 'unknown' };
  if (SUGGESTED_ADMIN.has(key)) {
    return {
      groupId: 'administration',
      provenance: 'suggested',
      sourceConfirmed: false,
      kind: 'cost',
      note: 'Not on the V2 group list. Suggested Administration Expenses only; change it if that is wrong.',
    };
  }
  for (const group of GROUPS) {
    if (group.forecastLines.some((line) => normLabel(line) === key)) {
      return { groupId: group.id, provenance: 'source', sourceConfirmed: true, kind: group.kind };
    }
  }
  return { groupId: 'ungrouped', provenance: 'unmapped', sourceConfirmed: false, kind: 'unknown' };
}

export function groupById(id) {
  return GROUPS.find((group) => group.id === id) || null;
}
