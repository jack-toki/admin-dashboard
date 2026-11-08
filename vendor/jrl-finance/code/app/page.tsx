import { getDashboard, getEntryContext } from "@/lib/data";
import { gbp, signed } from "@/lib/finance";
import { supabaseServer } from "@/lib/supabase/server";
import Allocation from "@/components/Allocation";
import GrowthChart from "@/components/GrowthChart";
import ThemeToggle from "@/components/ThemeToggle";
import Sidebar from "@/components/Sidebar";
import Nudge from "@/components/Nudge";
import SignOut from "@/components/SignOut";
import TargetStrip from "@/components/TargetStrip";

export const dynamic = "force-dynamic"; // always show the latest Slack update
export const revalidate = 0;

export default async function Page() {
  const { rows, latest, previous, perf, projection } = await getDashboard();
  const { missing } = await getEntryContext(rows);

  const db = await supabaseServer();
  const { data: targetRows } = await db
    .from("finance_target")
    .select("id,name,target_amount,tracks,scope")
    .order("created_at");

  const targets = (targetRows ?? []).map((t) => ({
    id: t.id, name: t.name,
    target_amount: Number(t.target_amount), tracks: t.tracks, scope: t.scope,
  }));

  const currentByTrack = {
    net: latest?.net_total ?? 0,
    savings: latest?.savings_total ?? 0,
    tax: latest?.tax_total ?? 0,
    chase: latest?.chase_total ?? 0,
    hl: latest?.hl_contributed ?? 0,
  };

  if (!latest || !perf) {
    return (
      <>
        <div className="aura" aria-hidden />
        <div className="app">
          <Sidebar />
          <main className="main">
            <div className="head"><div><h1>Overview</h1></div><div className="head-actions"><SignOut /><ThemeToggle /></div></div>
            <div className="panel glass">
              <h2>Nothing here yet</h2>
              <p className="sub">
                Add your first month under <b>This month&rsquo;s figures</b> and the
                dashboard fills in.
              </p>
            </div>
          </main>
        </div>
      </>
    );
  }

  const d = (cur: number, prev: number | undefined) =>
    previous === null ? "" : signed(cur - (prev ?? 0));

  const maxProj = projection[projection.length - 1].value;

  return (
    <>
      <div className="aura" aria-hidden />
      <div className="app">
        <Sidebar />
        <main className="main">
          <div className="head">
            <div>
              <h1>Overview</h1>
              <div className="period">{latest.month_name} {latest.year}</div>
            </div>
            <div className="head-actions"><SignOut /><ThemeToggle /></div>
          </div>

          <Nudge missing={missing} />

          {/* stat cards */}
          <div className="stats">
            <div className="card hero glass">
              <div className="k">Net total</div>
              <div className="v num">{gbp(latest.net_total)}</div>
              <span className="chip">{d(latest.net_total, previous?.net_total)}</span>
            </div>
            <div className="card glass">
              <div className="k">Chase balance</div>
              <div className="v num">{gbp(latest.chase_total)}</div>
              <span className="chip">{d(latest.chase_total, previous?.chase_total)}</span>
            </div>
            <div className="card glass">
              <div className="k">Savings pot</div>
              <div className="v num">{gbp(latest.savings_total)}</div>
              <span className="chip">{d(latest.savings_total, previous?.savings_total)}</span>
            </div>
            <div className="card glass">
              <div className="k">Tax pot</div>
              <div className="v num">{gbp(latest.tax_total)}</div>
              <span className="chip">{d(latest.tax_total, previous?.tax_total)}</span>
            </div>
            <div className="card glass">
              <div className="k">HargLans ISA</div>
              <div className="v num">{gbp(latest.hl_contributed)}</div>
              <span className="chip">{d(latest.hl_contributed, previous?.hl_contributed)}</span>
            </div>
          </div>

          <TargetStrip targets={targets} current={currentByTrack} />

          <div className="grid2">
            <div className="panel glass">
              <h2>Where it sits</h2>
              <p className="sub">Your net total, split three ways. HargLans ISA earnings stay out of this.</p>
              <Allocation
                savings={latest.savings_total}
                tax={latest.tax_total}
                hl={latest.hl_contributed}
              />
            </div>
            <div className="panel glass">
              <h2>How it&rsquo;s grown</h2>
              <p className="sub">
                Chase and HargLans ISA contributions month by month. The orange line is what the ISA is actually worth.
              </p>
              <GrowthChart rows={rows} />
            </div>
          </div>

          {/* HargLans ISA performance */}
          <div className="panel glass gap" id="hl">
            <h2>How HargLans ISA is doing</h2>
            <p className="sub">The bit that never touches your headline number.</p>
            <div className="perf">
              <div className="mini">
                <div className="k">Portfolio value</div>
                <div className="v num">{gbp(perf.currentValue)}</div>
                <div className="foot">
                  Sent in: <span className="num">{gbp(perf.totalContributed)}</span>
                  {!latest.hl_value_supplied && " · value carried forward"}
                </div>
              </div>
              <div className="mini">
                <div className="k">Earned this month</div>
                <div className={`v num ${(perf.earningsThisMonth ?? 0) >= 0 ? "pos" : "neg"}`}>
                  {perf.earningsThisMonth === null ? "—" : signed(perf.earningsThisMonth)}
                </div>
                <div className="foot">
                  {perf.earningsThisMonth === null
                    ? "Needs a fresh HargLans ISA value"
                    : "Market move, new money stripped out"}
                </div>
              </div>
              <div className="mini">
                <div className="k">Gain so far</div>
                <div className={`v num ${perf.gainSoFar >= 0 ? "pos" : "neg"}`}>
                  {signed(perf.gainSoFar)}
                </div>
                <div className="foot">
                  {perf.simpleReturnPct !== null
                    ? `${perf.simpleReturnPct >= 0 ? "+" : ""}${perf.simpleReturnPct.toFixed(1)}% on money in`
                    : "—"}
                </div>
              </div>
            </div>

            {perf.annualisedPct !== null && (
              <>
                <div className="verdict-row">
                  <span className={`badge ${perf.verdict === "lagging" ? "bad" : ""}`}>
                    {perf.verdict === "lagging" ? "Lagging" : "Tracking well"}
                  </span>
                  <span className="sub" style={{ margin: 0 }}>
                    {perf.annualisedPct.toFixed(1)}%/yr vs the 7% benchmark (
                    {perf.gapPP! >= 0 ? "+" : ""}{perf.gapPP!.toFixed(1)} pts)
                  </span>
                </div>
                {rows.length < 12 && (
                  <div className="caveat">
                    Annualised from only {rows.length} month{rows.length === 1 ? "" : "s"} of data —
                    early figures swing hard, so treat the % as a rough steer until there&rsquo;s a fuller year.
                  </div>
                )}
              </>
            )}
          </div>

          {/* projection */}
          <div className="panel glass gap" id="projection">
            <h2>If it keeps at 7% a year</h2>
            <p className="sub">
              Today&rsquo;s HargLans ISA value grown at 7%, no new money added. A hypothetical, not your real figures.
            </p>
            {projection.map((p) => (
              <div className="prow" key={p.years}>
                <span className="yr">{p.years} yrs</span>
                <span className="bar"><i style={{ width: `${(p.value / maxProj) * 100}%` }} /></span>
                <span className="amt num">{gbp(p.value)}</span>
              </div>
            ))}
          </div>

          {/* ledger */}
          <div className="ledger glass gap" id="ledger">
            <div className="ledger-head">
              <h2 style={{ fontWeight: 600, letterSpacing: "-.025em", fontSize: "1.14rem", margin: "0 0 3px" }}>
                The ledger
              </h2>
              <p className="sub">
                Every month so far. Chase is worked out for you — savings pot plus tax pot.
              </p>
            </div>
            <div className="ledger-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Month</th><th>Savings</th><th>Tax</th><th>Chase</th>
                    <th>HargLans ISA</th><th>ISA value</th><th>Gain</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows].reverse().map((r, i) => (
                    <tr key={r.period} className={i === 0 ? "latest" : undefined}>
                      <td>{r.month_name.slice(0, 3)}</td>
                      <td>{gbp(r.savings_total)}</td>
                      <td>{gbp(r.tax_total)}</td>
                      <td>{gbp(r.chase_total)}</td>
                      <td>{gbp(r.hl_contributed)}</td>
                      <td>{r.hl_value === null ? "—" : gbp(r.hl_value)}{!r.hl_value_supplied && r.hl_value !== null ? "*" : ""}</td>
                      <td><span className="g">{r.hl_gain === null ? "—" : signed(r.hl_gain)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </main>
      </div>
    </>
  );
}
