"use client";

import { useState, useTransition } from "react";
import { afford, type Kind } from "@/lib/afford";
import { gbp } from "@/lib/finance";
import { logPurchase } from "@/app/spending/actions";

export default function AffordPanel({
  savingsPot, monthlyBudget, emergencyFloor, spentThisMonth,
  wantSpendThisMonth, targetCommitments, targetName, savingsFirst, savedThisMonth,
}: {
  savingsPot: number;
  monthlyBudget: number;
  emergencyFloor: number;
  spentThisMonth: number;
  wantSpendThisMonth: number;
  targetCommitments: number;
  targetName?: string;
  savingsFirst: number;
  savedThisMonth: number;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<Kind>("want");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

  const n = (s: string) => {
    const x = parseFloat(String(s).replace(/[£,\s]/g, ""));
    return Number.isFinite(x) ? x : 0;
  };
  const price = n(amount);
  const ready = monthlyBudget > 0;
  const priced = price > 0;
  const result = ready && priced
    ? afford({
        price,
        kind,
        monthlyBudget,
        spentThisMonth,
        savingsPot,
        emergencyFloor,
        targetCommitments,
        savingsFirst,
        savedThisMonth,
        wantSpendThisMonth,
        targetName,
      })
    : null;

  const log = () => {
    if (!result || !description.trim() || price <= 0) return;
    setMsg("");
    start(async () => {
      const res = await logPurchase({
        description,
        amount: price,
        kind,
        advice: result.advice,
      });
      if (res.ok) {
        setDescription("");
        setAmount("");
        setMsg("Logged.");
      } else setMsg(res.error ?? "Couldn't log that.");
    });
  };

  return (
    <div className="panel glass gap">
      <h2>Can I afford it?</h2>
      <p className="sub">
        Checked against money you actually have — never income you haven&rsquo;t been paid.
      </p>

      <div className="afford-fields">
        <label className="entry-row">
          <span className="entry-label">What is it</span>
          <span className="entry-input tgt-text">
            <input
              value={description}
              placeholder="New coat"
              onChange={(e) => setDescription(e.target.value)}
            />
          </span>
        </label>
        <label className="entry-row">
          <span className="entry-label">Price</span>
          <span className="entry-input">
            <i>£</i>
            <input
              inputMode="decimal"
              value={amount}
              placeholder="0"
              onChange={(e) => setAmount(e.target.value)}
            />
          </span>
        </label>
      </div>

      <div className="tgt-modes">
        <button
          type="button"
          className={kind === "need" ? "tgt-mode on" : "tgt-mode"}
          onClick={() => setKind("need")}
        >
          Need
        </button>
        <button
          type="button"
          className={kind === "want" ? "tgt-mode on" : "tgt-mode"}
          onClick={() => setKind("want")}
        >
          Want
        </button>
      </div>

      {!ready && (
        <p className="sub">Set your monthly budget below to use this</p>
      )}
      {ready && !priced && (
        <p className="sub">Enter a price to see where you stand.</p>
      )}

      {result && (
        <div className="afford-verdict">
          <div className={`afford-head ${result.advice === "buy" ? "ok" : "warn"}`}>
            {result.headline}
          </div>
          <p className="afford-body">{result.reasoning}</p>
          <div className="afford-chals">
            {result.challenges.map((c) => (
              <div key={c.rule} className={c.flagged ? "afford-chal flag" : "afford-chal"}>
                <b>{c.rule}</b> {c.point}
              </div>
            ))}
          </div>
          <div className="afford-figs">
            <div className="afford-fig">
              Spendable this month
              <b>{gbp(result.availableNow)}</b>
            </div>
            <div className="afford-fig">
              Above emergency fund
              <b>{gbp(result.savingsHeadroom)}</b>
            </div>
            <div className="afford-fig">
              In 10 years at 7%
              <b>{gbp(result.opportunityCost)}</b>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="entry-actions">
          <button
            className="btn"
            onClick={log}
            disabled={pending || !description.trim() || price <= 0}
          >
            {pending
              ? "Logging…"
              : result.advice === "buy"
                ? "Log this purchase"
                : "Log it anyway"}
          </button>
          {msg && <span className={msg === "Logged." ? "entry-ok" : "entry-err"}>{msg}</span>}
        </div>
      )}
    </div>
  );
}
