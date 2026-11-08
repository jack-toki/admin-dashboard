import { getDashboard } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";
import SignOut from "@/components/SignOut";
import TargetPlanner, { type Target, type Current } from "@/components/TargetPlanner";
import NewTarget from "@/components/NewTarget";

export const dynamic = "force-dynamic";

export default async function TargetsPage() {
  const { rows, latest } = await getDashboard();
  const db = await supabaseServer();
  const { data } = await db.from("finance_target").select("*").order("created_at");

  const targets: Target[] = (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    target_amount: Number(t.target_amount),
    tracks: t.tracks,
    scope: t.scope,
    target_date: t.target_date,
    monthly_plan: t.monthly_plan === null ? null : Number(t.monthly_plan),
    growth_rate: Number(t.growth_rate),
  }));

  const current: Current = {
    net: latest?.net_total ?? 0,
    savings: latest?.savings_total ?? 0,
    tax: latest?.tax_total ?? 0,
    chase: latest?.chase_total ?? 0,
    hl: latest?.hl_contributed ?? 0,
  };

  // their actual recent average monthly saving, as a sensible starting point
  const recent = rows.slice(-3);
  const suggested = recent.length
    ? recent.reduce((s, r) => s + r.savings_in - r.savings_out, 0) / recent.length
    : 0;

  return (
    <>
      <div className="aura" aria-hidden />
      <div className="app">
        <Sidebar />
        <main className="main">
          <div className="head">
            <div>
              <h1>Targets</h1>
              <div className="period">What you&rsquo;re saving towards, and what it takes</div>
            </div>
            <div className="head-actions"><SignOut /><ThemeToggle /></div>
          </div>

          {targets.length === 0 && (
            <div className="panel glass">
              <h2>No targets yet</h2>
              <p className="sub">
                Set one and you&rsquo;ll see how long it takes at your current rate — or
                how much a month it needs to land by a date you pick.
              </p>
            </div>
          )}

          {targets.map((t) => (
            <TargetPlanner key={t.id} target={t} current={current} suggestedMonthly={suggested} />
          ))}

          <NewTarget />
        </main>
      </div>
    </>
  );
}
