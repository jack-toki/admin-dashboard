import { supabaseServer } from "@/lib/supabase/server";
import {
  performance as hlPerformance,
  projection as hlProjection,
  BENCHMARK_RATE,
} from "@/lib/finance";

export interface MonthRow {
  period: string;
  month_name: string;
  year: number;
  tax_in: number;
  savings_in: number;
  hl_in: number;
  savings_out: number;
  tax_total: number;
  savings_total: number;
  hl_contributed: number;
  hl_value: number | null;
  hl_value_supplied: boolean;
  chase_total: number;
  net_total: number;
  hl_gain: number | null;
  hl_earnings_this_month: number | null;
}

const n = (v: unknown) => Number(v ?? 0);

/** Everything the dashboard renders, in one call. */
export async function getDashboard() {
  const { data, error } = await (await supabaseServer())
    .from("monthly_finance")
    .select("*")
    .order("period");

  if (error) throw new Error(`Couldn't load the ledger: ${error.message}`);

  const rows: MonthRow[] = (data ?? []).map((r) => ({
    ...r,
    tax_in: n(r.tax_in), savings_in: n(r.savings_in), hl_in: n(r.hl_in),
    savings_out: n(r.savings_out), tax_total: n(r.tax_total),
    savings_total: n(r.savings_total), hl_contributed: n(r.hl_contributed),
    hl_value: r.hl_value === null ? null : n(r.hl_value),
    chase_total: n(r.chase_total), net_total: n(r.net_total),
    hl_gain: r.hl_gain === null ? null : n(r.hl_gain),
    hl_earnings_this_month:
      r.hl_earnings_this_month === null ? null : n(r.hl_earnings_this_month),
  }));

  if (!rows.length) {
    return { rows: [], latest: null, previous: null, perf: null, projection: [] };
  }

  const latest = rows[rows.length - 1];
  const previous = rows.length > 1 ? rows[rows.length - 2] : null;

  const perf = hlPerformance(
    rows.map((r) => ({
      period: r.period,
      hl_in: r.hl_in,
      hl_contributed: r.hl_contributed,
      hl_value: r.hl_value ?? 0,
    })),
    BENCHMARK_RATE,
  );
  // trust the view's gap-aware figure over a naive recompute
  perf.earningsThisMonth = latest.hl_earnings_this_month;

  return {
    rows,
    latest,
    previous,
    perf,
    projection: hlProjection(perf.currentValue),
  };
}

/** What the entry form needs: the month to default to, prior totals, and any
 *  existing entry for that month (so re-entering overwrites rather than adds). */
export async function getEntryContext(rows: MonthRow[]) {
  const now = new Date();
  // default to the month just gone — that's the one you'd be reporting
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const defaultPeriod = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;

  const before = rows.filter((r) => r.period < defaultPeriod);
  const prev = before.length ? before[before.length - 1] : null;
  const existingRow = rows.find((r) => r.period === defaultPeriod) ?? null;

  // any month between the first entry and the default one with nothing in it
  const missing: string[] = [];
  if (rows.length) {
    const have = new Set(rows.map((r) => r.period));
    const first = new Date(rows[0].period + "T00:00:00Z");
    const end = new Date(defaultPeriod + "T00:00:00Z");
    for (
      let d = new Date(first);
      d <= end;
      d.setUTCMonth(d.getUTCMonth() + 1)
    ) {
      const p = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
      if (!have.has(p)) missing.push(p);
    }
  }

  return {
    defaultPeriod,
    missing,
    prevTotals: {
      savings: prev?.savings_total ?? 0,
      tax: prev?.tax_total ?? 0,
      hlContributed: prev?.hl_contributed ?? 0,
    },
    existing: existingRow
      ? {
          period: existingRow.period,
          tax_in: existingRow.tax_in,
          savings_in: existingRow.savings_in,
          hl_in: existingRow.hl_in,
          savings_out: existingRow.savings_out,
          hl_value: existingRow.hl_value,
          hl_value_supplied: existingRow.hl_value_supplied,
        }
      : null,
  };
}
