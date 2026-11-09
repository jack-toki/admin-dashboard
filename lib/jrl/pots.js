// Four purpose pots. Not Holden’s pension/ISA/bond/GIA split, and not a risk ladder.
// £10,000 is a placeholder the person can edit. It is not advice and not a balance.
// A pound is not copied from one pot into another. Contributions are not a valuation.

export const DEFAULT_POT_TARGET = 10000;

export const POT_DEFINITIONS = [
  { id: 'lifestyle', label: 'Lifestyle', detail: 'Money set aside to spend. Not a record of what was already spent.' },
  { id: 'short_term', label: 'Short-term savings', detail: 'Cash for planned goals.' },
  { id: 'emergency', label: 'Emergency fund', detail: 'Accessible cash reserved for the unexpected.' },
  { id: 'investments', label: 'Long-term investments', detail: 'Latest current valuation, not the total paid in.' },
];

const IDS = new Set(POT_DEFINITIONS.map((pot) => pot.id));

export function blankPotRecord() {
  return {
    version: 1,
    targets: Object.fromEntries(POT_DEFINITIONS.map((pot) => [pot.id, DEFAULT_POT_TARGET])),
    manual: {},
    usePortfolioValue: false,
  };
}

export function normalisePotRecord(input) {
  const base = blankPotRecord();
  const targets = { ...base.targets };
  for (const pot of POT_DEFINITIONS) {
    const value = input?.targets?.[pot.id];
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) targets[pot.id] = number;
  }
  const manual = {};
  for (const pot of POT_DEFINITIONS) {
    const row = input?.manual?.[pot.id];
    if (!row || row.amount == null || row.amount === '') continue;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: 'balance' };
    manual[pot.id] = {
      amount,
      asOf: row.asOf ? String(row.asOf).slice(0, 10) : null,
      source: 'manual',
    };
  }
  return {
    ok: true,
    record: {
      version: 1,
      targets,
      manual,
      usePortfolioValue: input?.usePortfolioValue === true,
    },
  };
}

export function latestPortfolioValue(ledger) {
  const rows = [...(ledger || [])].reverse();
  const hit = rows.find((row) => row && row.hl_value != null && Number.isFinite(Number(row.hl_value)));
  if (!hit) return null;
  return { amount: Number(hit.hl_value), asOf: hit.period || null, source: 'hl_value' };
}

export function potViews(recordInput, ledger) {
  const normalised = normalisePotRecord(recordInput || {});
  const record = normalised.ok ? normalised.record : blankPotRecord();
  const portfolio = latestPortfolioValue(ledger);
  return POT_DEFINITIONS.map((pot) => {
    const target = record.targets[pot.id];
    const manual = record.manual[pot.id] || null;
    let balance = null;
    let asOf = null;
    let source = null;
    if (manual) {
      balance = manual.amount;
      asOf = manual.asOf;
      source = 'manual';
    } else if (pot.id === 'investments' && record.usePortfolioValue && portfolio) {
      balance = portfolio.amount;
      asOf = portfolio.asOf;
      source = 'hl_value';
    }
    const known = balance != null;
    const ratio = known && target > 0 ? balance / target : null;
    return {
      ...pot,
      target,
      balance,
      known,
      zero: known && balance === 0,
      asOf,
      source,
      manual: source === 'manual',
      reconciled: false,
      progress: known ? Math.min(1, Math.max(0, ratio)) : null,
      percent: known ? Math.round(ratio * 100) : null,
      remaining: known && balance < target ? target - balance : known ? 0 : null,
      over: known && balance > target ? balance - target : known ? 0 : null,
    };
  });
}

export function contributionsAreNotValuation(row) {
  return row?.hl_contributed != null && row?.hl_value == null;
}

export function potIds() {
  return [...IDS];
}
