"use client";

import { useState, useTransition } from "react";
import { gbp } from "@/lib/finance";
import {
  monthsToTarget, monthlyForTarget, projectPath,
  humanMonths, targetDate, monthsUntil,
} from "@/lib/targets";
import { saveTarget, deleteTarget } from "@/app/targets/actions";

export interface Target {
  id: string;
  name: string;
  target_amount: number;
  tracks: "net" | "savings" | "tax" | "chase" | "hl";
  scope: "personal" | "business";
  target_date: string | null;
  monthly_plan: number | null;
  growth_rate: number;
}

export interface Current {
  net: number; savings: number; tax: number; chase: number; hl: number;
}

const TRACK_LABEL: Record<Target["tracks"], string> = {
  net: "Net total", savings: "Savings pot", tax: "Tax pot",
  chase: "Chase balance", hl: "HargLans ISA",
};

const num = (s: string) => {
  const x = parseFloat(String(s).replace(/[£,\s]/g, ""));
  return Number.isFinite(x) ? x : 0;
};

export default function TargetPlanner({
  target, current, suggestedMonthly,
}: {
  target: Target;
  current: Current;
  suggestedMonthly: number;   // their actual recent average, as a starting point
}) {
  const have = current[target.tracks];

  // which side of the equation you're driving
  const [mode, setMode] = useState<"from-monthly" | "from-date">(
    target.target_date ? "from-date" : "from-monthly",
  );
  const [monthly, setMonthly] = useState(
    String(target.monthly_plan ?? Math.round(suggestedMonthly) ?? 0),
  );
  const [months, setMonths] = useState(
    target.target_date ? monthsUntil(target.target_date) : 24,
  );
  const [rate, setRate] = useState(String((target.growth_rate * 100).toFixed(2).replace(/\.?0+$/, "")));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

  const annualRate = num(rate) / 100;
  const plan = { current: have, target: target.target_amount, annualRate };

  const solvedMonths = monthsToTarget({ ...plan, monthly: num(monthly) });
  const solvedMonthly = monthlyForTarget({ ...plan, months });

  const showMonths = mode === "from-monthly" ? solvedMonths : months;
  const showMonthly = mode === "from-monthly" ? num(monthly) : (solvedMonthly ?? 0);

  const remaining = Math.max(0, target.target_amount - have);
  const pct = Math.min(100, (have / target.target_amount) * 100);
  const done = have >= target.target_amount;

  const path = projectPath({
    ...plan, monthly: showMonthly, months: Math.min(showMonths ?? 0, 600),
  });
  const contributed = showMonthly * (showMonths ?? 0);
  const fromGrowth = path.length ? path[path.length - 1].value - have - contributed : 0;

  const save = () => {
    setMsg("");
    start(async () => {
      const res = await saveTarget({
        id: target.id,
        name: target.name,
        target_amount: target.target_amount,
        tracks: target.tracks,
        scope: target.scope,
        target_date: mode === "from-date" ? isoFromMonths(months) : null,
        monthly_plan: mode === "from-monthly" ? num(monthly) : (solvedMonthly ?? null),
        growth_rate: annualRate,
      });
      setMsg(res.ok ? "Saved." : res.error ?? "Couldn't save.");
    });
  };

  return (
    <div className="panel glass gap">
      <div className="entry-head">
        <div>
          <h2>
            {target.name}{" "}
            <span className={target.scope === "business" ? "kind-badge want" : "kind-badge"}>
              {target.scope}
            </span>
          </h2>
          <p className="sub">
            {gbp(target.target_amount)} · tracked against your {target.tracks === "hl" ? "HargLans ISA" : TRACK_LABEL[target.tracks].toLowerCase()}
          </p>
        </div>
        <button
          className="nudge-btn"
          onClick={() => start(async () => { await deleteTarget(target.id); })}
        >
          Remove
        </button>
      </div>

      {/* progress */}
      <div className="tgt-progress">
        <div className="tgt-bar"><i style={{ width: `${pct}%` }} /></div>
        <div className="tgt-progress-row">
          <span><b>{gbp(have)}</b> of {gbp(target.target_amount)}</span>
          <span className="muted-note">
            {done ? "Target reached" : `${gbp(remaining)} to go · ${pct.toFixed(0)}%`}
          </span>
        </div>
      </div>

      {done ? (
        <p className="sub" style={{ marginTop: 18 }}>
          You&rsquo;re past this one. Raise the target or remove it.
        </p>
      ) : (
        <>
          {/* which way round */}
          <div className="tgt-modes">
            <button
              className={mode === "from-monthly" ? "tgt-mode on" : "tgt-mode"}
              onClick={() => setMode("from-monthly")}
            >
              I&rsquo;ll save this much →
            </button>
            <button
              className={mode === "from-date" ? "tgt-mode on" : "tgt-mode"}
              onClick={() => setMode("from-date")}
            >
              I want it by then →
            </button>
          </div>

          <div className="tgt-grid">
            <div>
              {mode === "from-monthly" ? (
                <label className="entry-row">
                  <span className="entry-label">
                    Saving each month
                    <em>what you reckon you can put away</em>
                  </span>
                  <span className="entry-input">
                    <i>£</i>
                    <input
                      inputMode="decimal"
                      value={monthly}
                      onChange={(e) => setMonthly(e.target.value)}
                    />
                  </span>
                </label>
              ) : (
                <div className="entry-row tgt-slider-row">
                  <span className="entry-label">
                    Reach it in
                    <em>{humanMonths(months)} · {targetDate(months)}</em>
                  </span>
                  <input
                    className="tgt-slider"
                    type="range"
                    min={1}
                    max={240}
                    value={months}
                    onChange={(e) => setMonths(Number(e.target.value))}
                  />
                </div>
              )}

              <label className="entry-row">
                <span className="entry-label">
                  Assumed growth
                  <em>interest or market return on this pot</em>
                </span>
                <span className="entry-input tgt-rate">
                  <input
                    inputMode="decimal"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                  />
                  <i>% / yr</i>
                </span>
              </label>
            </div>

            {/* the answer */}
            <div className="tgt-answer">
              {mode === "from-monthly" ? (
                <>
                  <div className="k">At {gbp(num(monthly))} a month</div>
                  <div className="tgt-big">{humanMonths(solvedMonths)}</div>
                  {solvedMonths !== null && solvedMonths > 0 && (
                    <div className="foot">Hits {gbp(target.target_amount)} around {targetDate(solvedMonths)}</div>
                  )}
                  {solvedMonths === null && (
                    <div className="foot">
                      That won&rsquo;t get there. Put more away each month, or allow some growth.
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="k">To hit it by {targetDate(months)}</div>
                  <div className="tgt-big">
                    {solvedMonthly === null ? "—" : `${gbp(solvedMonthly)}/mo`}
                  </div>
                  <div className="foot">
                    {solvedMonthly !== null && suggestedMonthly > 0 && (
                      solvedMonthly > suggestedMonthly
                        ? `That's ${gbp(solvedMonthly - suggestedMonthly)} more than your recent average.`
                        : `Comfortably under your recent average of ${gbp(suggestedMonthly)}.`
                    )}
                  </div>
                </>
              )}

              {showMonths !== null && showMonths > 0 && annualRate > 0 && (
                <div className="tgt-split">
                  <span>You put in <b>{gbp(contributed)}</b></span>
                  <span>Growth adds <b>{gbp(fromGrowth)}</b></span>
                </div>
              )}
            </div>
          </div>

          <div className="entry-actions">
            <button className="btn" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save this plan"}
            </button>
            {msg && <span className="entry-ok">{msg}</span>}
          </div>
        </>
      )}
    </div>
  );
}

function isoFromMonths(n: number) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
