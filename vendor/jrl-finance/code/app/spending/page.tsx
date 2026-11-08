import { getDashboard } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";
import SignOut from "@/components/SignOut";
import AffordPanel from "@/components/AffordPanel";
import SpendSettings from "@/components/SpendSettings";
import PurchaseList from "@/components/PurchaseList";

export const dynamic = "force-dynamic";

export default async function SpendingPage() {
  const { latest } = await getDashboard();
  const db = await supabaseServer();

  const { data: settingRows } = await db.from("finance_setting").select("key,value");
  const setting = (k: string) => Number(settingRows?.find((s) => s.key === k)?.value ?? 0);

  const now = new Date();
  const from = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const { data: purchases } = await db
    .from("purchase").select("*").gte("spent_on", from).order("spent_on", { ascending: false });

  const spentThisMonth = (purchases ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const wantSpendThisMonth = (purchases ?? [])
    .filter((p) => p.kind === "want")
    .reduce((s, p) => s + Number(p.amount), 0);

  const { data: tgt } = await db
    .from("finance_target").select("name,monthly_plan,scope")
    .eq("scope", "personal").order("created_at");
  const targetCommitments = (tgt ?? []).reduce((s, t) => s + Number(t.monthly_plan ?? 0), 0);
  const targetName = tgt?.[0]?.name as string | undefined;

  const { data: thisMonth } = await db
    .from("monthly_entry").select("savings_in").eq("period", from).maybeSingle();
  const savedThisMonth = Number(thisMonth?.savings_in ?? 0);

  const monthlyBudget = setting("monthly_budget");
  const emergencyFloor = setting("emergency_floor");
  const savingsFirst = setting("savings_first");
  const savingsPot = latest?.savings_total ?? 0;

  const rows = (purchases ?? []).map((p) => ({
    id: p.id,
    spent_on: p.spent_on,
    description: p.description,
    amount: Number(p.amount),
    kind: p.kind as "need" | "want",
    advice: p.advice as string | null,
    source: typeof p.source === "string" ? p.source : null,
    raw_input: typeof p.raw_input === "string" ? p.raw_input : null,
  }));

  return (
    <>
      <div className="aura" aria-hidden />
      <div className="app">
        <Sidebar />
        <main className="main">
          <div className="head">
            <div>
              <h1>Spending</h1>
              <div className="period">Can you afford it — against money you actually have</div>
            </div>
            <div className="head-actions"><SignOut /><ThemeToggle /></div>
          </div>

          <AffordPanel
            savingsPot={savingsPot}
            monthlyBudget={monthlyBudget}
            emergencyFloor={emergencyFloor}
            spentThisMonth={spentThisMonth}
            wantSpendThisMonth={wantSpendThisMonth}
            targetCommitments={targetCommitments}
            targetName={targetName}
            savingsFirst={savingsFirst}
            savedThisMonth={savedThisMonth}
          />

          <SpendSettings
            monthlyBudget={monthlyBudget}
            emergencyFloor={emergencyFloor}
            savingsFirst={savingsFirst}
          />

          <PurchaseList
            purchases={rows}
            spentThisMonth={spentThisMonth}
            monthlyBudget={monthlyBudget}
          />
        </main>
      </div>
    </>
  );
}
