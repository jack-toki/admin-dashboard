import { getDashboard, getEntryContext } from "@/lib/data";
import { gbp, signed } from "@/lib/finance";
import EntryForm from "@/components/EntryForm";
import Sidebar from "@/components/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";
import SignOut from "@/components/SignOut";
import Nudge from "@/components/Nudge";

export const dynamic = "force-dynamic";

export default async function MonthPage() {
  const { rows } = await getDashboard();
  const { defaultPeriod, missing } = await getEntryContext(rows);

  const history = rows.map((r) => ({
    period: r.period,
    tax_in: r.tax_in, savings_in: r.savings_in, hl_in: r.hl_in,
    savings_out: r.savings_out,
    hl_value: r.hl_value, hl_value_supplied: r.hl_value_supplied,
    tax_total: r.tax_total, savings_total: r.savings_total,
    hl_contributed: r.hl_contributed,
  }));

  return (
    <>
      <div className="aura" aria-hidden />
      <div className="app">
        <Sidebar />
        <main className="main">
          <div className="head">
            <div>
              <h1>This month&rsquo;s figures</h1>
              <div className="period">What went in, what came out</div>
            </div>
            <div className="head-actions"><SignOut /><ThemeToggle /></div>
          </div>

          <Nudge missing={missing} />

          <EntryForm defaultPeriod={defaultPeriod} history={history} />

          <div className="ledger glass gap">
            <div className="ledger-head">
              <h2 style={{ fontWeight: 600, letterSpacing: "-.025em", fontSize: "1.14rem", margin: "0 0 3px" }}>
                Everything entered so far
              </h2>
              <p className="sub">
                Pick any month in the form above to edit it — saving overwrites, and
                every later month recalculates.
              </p>
            </div>
            {rows.length === 0 ? (
              <p className="sub" style={{ padding: "0 20px 20px" }}>Nothing entered yet.</p>
            ) : (
              <div className="ledger-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Month</th><th>Tax in</th><th>Savings in</th><th>HargLans ISA</th>
                      <th>Withdrawn</th><th>ISA value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows].reverse().map((r, i) => (
                      <tr key={r.period} className={i === 0 ? "latest" : undefined}>
                        <td>{r.month_name.slice(0, 3)} {String(r.year).slice(2)}</td>
                        <td>{r.tax_in ? `+${gbp(r.tax_in)}` : "—"}</td>
                        <td>{r.savings_in ? `+${gbp(r.savings_in)}` : "—"}</td>
                        <td>{r.hl_in ? `+${gbp(r.hl_in)}` : "—"}</td>
                        <td>{r.savings_out ? <span className="neg">−{gbp(r.savings_out)}</span> : "—"}</td>
                        <td>{r.hl_value_supplied && r.hl_value !== null ? gbp(r.hl_value) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
