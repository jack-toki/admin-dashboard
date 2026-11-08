"use client";

import { useState, useTransition } from "react";
import { gbp, signed } from "@/lib/finance";
import { saveMonth } from "@/app/actions";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The five things you type. Fixed order, every month, forever. */
const FIELDS = [
  { key: "taxIn",      label: "Tax saved",              group: "IN"  },
  { key: "savingsIn",  label: "Savings added",          group: "IN"  },
  { key: "hlIn",       label: "HargLans ISA",           group: "IN"  },
  { key: "savingsOut", label: "Withdrawn from savings", group: "OUT" },
  { key: "hlValue",    label: "HargLans ISA value",     group: "HL", hint: "from the HargLans app" },
] as const;

type Key = typeof FIELDS[number]["key"];
type Values = Record<Key, string>;

const EMPTY: Values = { taxIn: "", savingsIn: "", hlIn: "", savingsOut: "", hlValue: "" };

export interface HistoryRow {
  period: string;
  tax_in: number; savings_in: number; hl_in: number; savings_out: number;
  hl_value: number | null; hl_value_supplied: boolean;
  tax_total: number; savings_total: number; hl_contributed: number;
}

const fill = (r: HistoryRow | null): Values =>
  r
    ? {
        taxIn: String(r.tax_in ?? ""),
        savingsIn: String(r.savings_in ?? ""),
        hlIn: String(r.hl_in ?? ""),
        savingsOut: String(r.savings_out ?? ""),
        hlValue: r.hl_value_supplied && r.hl_value !== null ? String(r.hl_value) : "",
      }
    : EMPTY;

export default function EntryForm({
  defaultPeriod,
  history,
}: {
  defaultPeriod: string;        // 'YYYY-MM-01'
  history: HistoryRow[];        // every month already entered, oldest first
}) {
  const [period, setPeriod] = useState(defaultPeriod);

  const existing = history.find((r) => r.period === period) ?? null;
  const before = history.filter((r) => r.period < period);
  const last = before.length ? before[before.length - 1] : null;
  const prevTotals = {
    savings: last?.savings_total ?? 0,
    tax: last?.tax_total ?? 0,
    hlContributed: last?.hl_contributed ?? 0,
  };

  const [v, setV] = useState<Values>(() => fill(history.find((r) => r.period === defaultPeriod) ?? null));
  const [pending, start] = useTransition();

  const pickMonth = (p: string) => {
    setPeriod(p);
    setV(fill(history.find((r) => r.period === p) ?? null));
    setResult(null);
  };
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const n = (s: string) => {
    const c = s.replace(/[£,\s]/g, "");
    const x = parseFloat(c);
    return Number.isFinite(x) ? x : 0;
  };

  // live preview — exactly what the database will derive
  const newSavings = prevTotals.savings + n(v.savingsIn) - n(v.savingsOut);
  const newTax     = prevTotals.tax + n(v.taxIn);
  const newHL      = prevTotals.hlContributed + n(v.hlIn);
  const newChase   = newSavings + newTax;
  const newNet     = newChase + newHL;
  const overdrawn  = newSavings < 0;

  const [y, m] = period.split("-").map(Number);
  const monthLabel = `${MONTHS[m - 1]} ${y}`;

  const submit = () => {
    setResult(null);
    start(async () => {
      const res = await saveMonth({
        period,
        taxIn: n(v.taxIn),
        savingsIn: n(v.savingsIn),
        hlIn: n(v.hlIn),
        savingsOut: n(v.savingsOut),
        hlValue: v.hlValue.trim() === "" ? null : n(v.hlValue),
      });
      setResult(res.ok
        ? { ok: true, msg: `${monthLabel} saved. Everything below has updated.` }
        : { ok: false, msg: res.error ?? "Couldn't save that." });
    });
  };

  // this month plus the previous 23
  const options = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - i, 1));
    const p = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    return { value: p, label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
  });

  return (
    <div className="panel glass gap" id="entry">
      {existing ? (
        <div className="entry-status done">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <span><b>{monthLabel} is in.</b> Saving again overwrites it.</span>
        </div>
      ) : (
        <div className="entry-status todo">
          <span className="entry-status-dot" aria-hidden />
          <span><b>{monthLabel} isn't in yet.</b> Fill it in below.</span>
        </div>
      )}
      <div className="entry-head">
        <div>
          <h2>{existing ? "Update this month" : "Add this month"}</h2>
          <p className="sub">
            Only what went in and what came out. Chase, totals and gain work themselves out.
          </p>
        </div>
        <select
          className="month-select"
          value={period}
          onChange={(e) => pickMonth(e.target.value)}
          aria-label="Which month"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="entry-grid">
        <div className="entry-col">
          <div className="entry-group">In</div>
          {FIELDS.filter((f) => f.group === "IN").map((f) => (
            <Row key={f.key} f={f} v={v} setV={setV} />
          ))}

          <div className="entry-group out">Out</div>
          {FIELDS.filter((f) => f.group === "OUT").map((f) => (
            <Row key={f.key} f={f} v={v} setV={setV} />
          ))}

          <div className="entry-group">Balance</div>
          {FIELDS.filter((f) => f.group === "HL").map((f) => (
            <Row key={f.key} f={f} v={v} setV={setV} />
          ))}
        </div>

        <div className="entry-preview">
          <div className="entry-group">After saving</div>
          <Pre k="Savings pot" from={prevTotals.savings} to={newSavings} warn={overdrawn} />
          <Pre k="Tax pot"     from={prevTotals.tax} to={newTax} />
          <Pre k="Chase"       from={prevTotals.savings + prevTotals.tax} to={newChase} />
          <Pre k="HargLans ISA"  from={prevTotals.hlContributed} to={newHL} />
          <div className="pre-net">
            <span>Net total</span>
            <b className="num">{gbp(newNet)}</b>
          </div>
          {v.hlValue.trim() !== "" && (
            <div className="pre-extra">
              HargLans ISA gain: <b>{signed(n(v.hlValue) - newHL)}</b>
              <span> — kept out of the total</span>
            </div>
          )}
          {v.hlValue.trim() === "" && (
            <div className="pre-extra muted-note">
              No HargLans ISA value — the gain and this month&rsquo;s earnings will show as blank.
            </div>
          )}
        </div>
      </div>

      {overdrawn && (
        <div className="entry-warn">
          That withdrawal takes the savings pot below zero ({gbp(newSavings)}). Worth a check before saving.
        </div>
      )}

      <div className="entry-actions">
        <button className="btn" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : existing ? `Update ${monthLabel}` : `Save ${monthLabel}`}
        </button>
        {result && (
          <span className={result.ok ? "entry-ok" : "entry-err"}>{result.msg}</span>
        )}
      </div>
    </div>
  );
}

function Row({
  f, v, setV,
}: {
  f: { key: Key; label: string; hint?: string };
  v: Values;
  setV: (u: Values) => void;
}) {
  return (
    <label className="entry-row">
      <span className="entry-label">
        {f.label}
        {f.hint && <em>{f.hint}</em>}
      </span>
      <span className="entry-input">
        <i>£</i>
        <input
          inputMode="decimal"
          value={v[f.key]}
          placeholder="0"
          onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
        />
      </span>
    </label>
  );
}

function Pre({ k, from, to, warn }: { k: string; from: number; to: number; warn?: boolean }) {
  const moved = Math.abs(to - from) > 0.005;
  return (
    <div className="pre-row">
      <span>{k}</span>
      <span className="num">
        {moved && <em>{gbp(from)} →</em>}
        <b className={warn ? "neg" : undefined}>{gbp(to)}</b>
      </span>
    </div>
  );
}
