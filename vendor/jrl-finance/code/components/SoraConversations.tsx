"use client";

import { useMemo, useState, useTransition } from "react";
import { deleteConversation } from "@/app/sora/actions";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  groupByDay,
  parseConversation,
  SORA_PAGE,
  timeOf,
  triggerIcon,
  type SoraConversation,
} from "@/lib/sora";

type Filter = "all" | "actions" | "alerts" | "failed";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "actions", label: "With actions" },
  { id: "alerts", label: "Alerts" },
  { id: "failed", label: "Failed" },
];

function matches(row: SoraConversation, filter: Filter) {
  if (filter === "actions") return row.actions.length > 0;
  if (filter === "alerts") return row.trigger === "alert";
  if (filter === "failed") return row.actions.some((a) => !a.ok);
  return true;
}

export default function SoraConversations({
  initial, initialHasMore, loadError,
}: {
  initial: SoraConversation[];
  initialHasMore: boolean;
  loadError: string | null;
}) {
  const [rows, setRows] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(loadError);
  const [pending, start] = useTransition();

  const visible = useMemo(() => rows.filter((r) => matches(r, filter)), [rows, filter]);
  const groups = useMemo(() => groupByDay(visible), [visible]);

  async function loadFrom(cursor?: string) {
    const db = supabaseBrowser();
    let q = db
      .from("sora_conversation")
      .select("id,started_at,ended_at,trigger,summary,transcript,actions")
      .order("started_at", { ascending: false })
      .limit(SORA_PAGE);
    if (cursor) q = q.lt("started_at", cursor);
    const { data, error: err } = await q;
    if (err) {
      setError(err.message);
      return;
    }
    const next = (data ?? []).map((row) => parseConversation(row as Record<string, unknown>));
    setError(null);
    setRows((prev) => {
      if (!cursor) return next;
      const seen = new Set(prev.map((r) => r.id));
      return [...prev, ...next.filter((r) => !seen.has(r.id))];
    });
    setHasMore(next.length === SORA_PAGE);
  }

  function toggle(id: string) {
    setOpenId((cur) => (cur === id ? null : id));
    setConfirmId(null);
  }

  function remove(id: string) {
    start(async () => {
      const res = await deleteConversation(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
      setOpenId((cur) => (cur === id ? null : cur));
      setConfirmId(null);
    });
  }

  return (
    <div className="ledger glass gap">
      <div className="ledger-head sora-head">
        <div>
          <h2 style={{ fontWeight: 600, letterSpacing: "-.025em", fontSize: "1.14rem", margin: "0 0 3px" }}>
            Conversations
          </h2>
          <p className="sub">Newest first. Tap a row for the transcript.</p>
        </div>
        <button
          type="button"
          className="nudge-btn"
          onClick={() => start(() => loadFrom())}
          disabled={pending}
        >
          Refresh
        </button>
      </div>

      <div className="sora-filters" role="tablist" aria-label="Filter conversations">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={`tgt-mode${filter === f.id ? " on" : ""}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="entry-err" style={{ padding: "0 20px 12px" }}>{error}</p>}

      {visible.length === 0 && !error ? (
        <p className="sub" style={{ padding: "0 20px 20px" }}>
          {rows.length === 0
            ? <>No conversations yet. Say &ldquo;Sora&rdquo; to get started.</>
            : "Nothing matches this filter."}
        </p>
      ) : (
        <div className="sora-list">
          {groups.map((g) => (
            <section key={g.heading}>
              <h3 className="sora-day">{g.heading}</h3>
              {g.rows.map((row) => {
                const open = openId === row.id;
                const failed = row.actions.some((a) => !a.ok);
                return (
                  <article key={row.id} className={`sora-ask${open ? " open" : ""}`}>
                    <button
                      type="button"
                      className="sora-row"
                      aria-expanded={open}
                      onClick={() => toggle(row.id)}
                    >
                      <span className="sora-time num">{timeOf(row.started_at)}</span>
                      <span className="sora-trig" aria-hidden>{triggerIcon(row.trigger)}</span>
                      <span className="sora-sum">{row.summary}</span>
                      <span className="sora-meta">
                        {row.actions.length > 0 && (
                          <span className="kind-badge">
                            {row.actions.length} {row.actions.length === 1 ? "action" : "actions"}
                          </span>
                        )}
                        {failed && <span className="sora-fail" title="An action failed" />}
                        <span className="sora-chev" aria-hidden>{open ? "▾" : "▸"}</span>
                      </span>
                    </button>

                    {open && (
                      <div className="sora-body">
                        <div className="sora-section">
                          <h4>Transcript</h4>
                          {row.transcript.length === 0 ? (
                            <p className="sub">Nothing recorded.</p>
                          ) : (
                            <div className="sora-chat">
                              {row.transcript.map((line, i) => (
                                <div key={`${line.at}-${i}`} className={`sora-line ${line.role}`}>
                                  <p>{line.text}</p>
                                  {line.at && <time className="num">{timeOf(line.at)}</time>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {row.actions.length > 0 && (
                          <div className="sora-section">
                            <h4>Actions</h4>
                            <ul className="sora-actions">
                              {row.actions.map((a, i) => (
                                <li key={`${a.at}-${i}`}>
                                  <div className="sora-act">
                                    <span className={a.ok ? "pos" : "neg"} aria-hidden>
                                      {a.ok ? "✓" : "✕"}
                                    </span>
                                    <span>{a.label}</span>
                                    {a.at && <time className="num">{timeOf(a.at)}</time>}
                                  </div>
                                  <details className="sora-debug">
                                    <summary>details</summary>
                                    <pre>
                                      {JSON.stringify({ input: a.input, result: a.result }, null, 2)}
                                    </pre>
                                  </details>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="sora-del">
                          {confirmId === row.id ? (
                            <>
                              <span className="sub" style={{ margin: 0 }}>Delete this conversation?</span>
                              <button type="button" className="nudge-btn" onClick={() => setConfirmId(null)}>
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="nudge-btn sora-del-confirm"
                                onClick={() => remove(row.id)}
                                disabled={pending}
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <button type="button" className="sora-del-link" onClick={() => setConfirmId(row.id)}>
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="sora-more">
          <button type="button" className="nudge-btn" onClick={() => start(() => loadFrom(rows.at(-1)?.started_at))} disabled={pending}>
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
