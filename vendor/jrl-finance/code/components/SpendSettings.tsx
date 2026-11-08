"use client";

import { useState, useTransition } from "react";
import { saveSpendSettings } from "@/app/spending/actions";

export default function SpendSettings({
  monthlyBudget, emergencyFloor, savingsFirst,
}: {
  monthlyBudget: number;
  emergencyFloor: number;
  savingsFirst: number;
}) {
  const [budget, setBudget] = useState(String(monthlyBudget || ""));
  const [floor, setFloor] = useState(String(emergencyFloor || ""));
  const [first, setFirst] = useState(String(savingsFirst || ""));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

  const n = (s: string) => {
    const x = parseFloat(String(s).replace(/[£,\s]/g, ""));
    return Number.isFinite(x) ? x : 0;
  };

  const save = () => {
    setMsg("");
    start(async () => {
      const res = await saveSpendSettings({
        monthlyBudget: n(budget),
        emergencyFloor: n(floor),
        savingsFirst: n(first),
      });
      setMsg(res.ok ? "Saved." : res.error ?? "Couldn't save.");
    });
  };

  return (
    <div className="panel glass gap">
      <h2>Spending rules</h2>
      <p className="sub">
        The floor is hard. Nothing the adviser suggests will ever dip below it.
      </p>
      <label className="entry-row">
        <span className="entry-label">Monthly budget</span>
        <span className="entry-input">
          <i>£</i>
          <input
            inputMode="decimal"
            value={budget}
            placeholder="0"
            onChange={(e) => setBudget(e.target.value)}
          />
        </span>
      </label>
      <label className="entry-row">
        <span className="entry-label">Emergency fund floor</span>
        <span className="entry-input">
          <i>£</i>
          <input
            inputMode="decimal"
            value={floor}
            placeholder="0"
            onChange={(e) => setFloor(e.target.value)}
          />
        </span>
      </label>
      <label className="entry-row">
        <span className="entry-label">
          Saved every month
          <em>before spending</em>
        </span>
        <span className="entry-input">
          <i>£</i>
          <input
            inputMode="decimal"
            value={first}
            placeholder="0"
            onChange={(e) => setFirst(e.target.value)}
          />
        </span>
      </label>
      <div className="entry-actions">
        <button className="btn" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save rules"}
        </button>
        {msg && <span className={msg === "Saved." ? "entry-ok" : "entry-err"}>{msg}</span>}
      </div>
    </div>
  );
}
