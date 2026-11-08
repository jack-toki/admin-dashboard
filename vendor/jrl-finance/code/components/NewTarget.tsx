"use client";

import { useState, useTransition } from "react";
import { saveTarget } from "@/app/targets/actions";

const TRACKS = [
  { v: "net",     label: "Net total",     rate: "0"    },
  { v: "savings", label: "Savings pot",   rate: "4.5"  },
  { v: "chase",   label: "Chase balance", rate: "4.5"  },
  { v: "tax",     label: "Tax pot",       rate: "4.5"  },
  { v: "hl",      label: "HargLans ISA",  rate: "0"   },
] as const;

export default function NewTarget() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [tracks, setTracks] = useState<typeof TRACKS[number]["v"]>("savings");
  const [scope, setScope] = useState<"personal" | "business">("personal");
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");

  const add = () => {
    setErr("");
    start(async () => {
      const rate = Number(TRACKS.find((t) => t.v === tracks)!.rate) / 100;
      const res = await saveTarget({
        name,
        target_amount: Number(String(amount).replace(/[£,\s]/g, "")),
        tracks,
        scope,
        target_date: null,
        monthly_plan: null,
        growth_rate: rate,
      });
      if (res.ok) { setOpen(false); setName(""); setAmount(""); setScope("personal"); }
      else setErr(res.error ?? "Couldn't add it.");
    });
  };

  if (!open) {
    return (
      <button className="btn gap" onClick={() => setOpen(true)} style={{ marginTop: 12 }}>
        Add a target
      </button>
    );
  }

  return (
    <div className="panel glass gap">
      <h2>New target</h2>
      <p className="sub">What are you saving towards?</p>
      <div className="tgt-new">
        <label className="entry-row">
          <span className="entry-label">Name</span>
          <span className="entry-input tgt-text">
            <input value={name} placeholder="House deposit"
                   onChange={(e) => setName(e.target.value)} />
          </span>
        </label>
        <label className="entry-row">
          <span className="entry-label">Amount</span>
          <span className="entry-input">
            <i>£</i>
            <input inputMode="decimal" value={amount} placeholder="50000"
                   onChange={(e) => setAmount(e.target.value)} />
          </span>
        </label>
        <div className="tgt-modes">
          <button
            type="button"
            className={scope === "personal" ? "tgt-mode on" : "tgt-mode"}
            onClick={() => setScope("personal")}
          >
            Personal
          </button>
          <button
            type="button"
            className={scope === "business" ? "tgt-mode on" : "tgt-mode"}
            onClick={() => setScope("business")}
          >
            Business
          </button>
        </div>
        <label className="entry-row">
          <span className="entry-label">
            Measured against
            <em>which figure counts towards it</em>
          </span>
          <select className="month-select" value={tracks}
                  onChange={(e) => setTracks(e.target.value as typeof tracks)}>
            {TRACKS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </label>
      </div>
      <div className="entry-actions">
        <button className="btn" onClick={add} disabled={pending || !name || !amount}>
          {pending ? "Adding…" : "Add target"}
        </button>
        <button className="nudge-btn" onClick={() => setOpen(false)}>Cancel</button>
        {err && <span className="entry-err">{err}</span>}
      </div>
    </div>
  );
}
