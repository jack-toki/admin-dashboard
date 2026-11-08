import { gbp } from "@/lib/finance";
import { removePurchase } from "@/app/spending/actions";

export interface Purchase {
  id: string;
  spent_on: string;
  description: string;
  amount: number;
  kind: "need" | "want";
  advice: string | null;
  source?: string | null;
  raw_input?: string | null;
}

const ADVICE: Record<string, string> = {
  buy: "Buy",
  "save-first": "Save first",
  "sleep-on-it": "Sleep on it",
  "split-it": "Split it",
  wait: "Wait",
  dont: "Don't",
};

function day(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export default function PurchaseList({
  purchases, spentThisMonth, monthlyBudget,
}: {
  purchases: Purchase[];
  spentThisMonth: number;
  monthlyBudget: number;
}) {
  return (
    <div className="ledger glass gap">
      <div className="ledger-head">
        <h2 style={{ fontWeight: 600, letterSpacing: "-.025em", fontSize: "1.14rem", margin: "0 0 3px" }}>
          This month
        </h2>
        <p className="sub">
          {gbp(spentThisMonth)} of {gbp(monthlyBudget)} budget
        </p>
      </div>
      {purchases.length === 0 ? (
        <p className="sub" style={{ padding: "0 20px 20px" }}>Nothing logged this month.</p>
      ) : (
        <div className="ledger-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>What</th>
                <th>Kind</th>
                <th>Amount</th>
                <th>Advice</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td>{day(p.spent_on)}</td>
                  <td>
                    {p.description}
                    {p.source === "sora" && (
                      <span className="sora-from" title={p.raw_input || "Logged by Sora"} aria-label={p.raw_input || "Logged by Sora"}>
                        {" "}🎙️
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`kind-badge ${p.kind}`}>{p.kind}</span>
                  </td>
                  <td className="num">{gbp(p.amount)}</td>
                  <td>{p.advice ? (ADVICE[p.advice] ?? p.advice) : "—"}</td>
                  <td>
                    <form action={removePurchase.bind(null, p.id)}>
                      <button type="submit" className="nudge-btn">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
