import { gbp } from "@/lib/finance";

export interface TargetSummary {
  id: string;
  name: string;
  target_amount: number;
  tracks: "net" | "savings" | "tax" | "chase" | "hl";
  scope: "personal" | "business";
}

const R = 26;
const C = 2 * Math.PI * R;

export default function TargetStrip({
  targets, current,
}: {
  targets: TargetSummary[];
  current: Record<TargetSummary["tracks"], number>;
}) {
  if (!targets.length) return null;

  return (
    <div className="tstrip">
      {targets.map((t) => {
        const have = current[t.tracks] ?? 0;
        const pct = Math.max(0, Math.min(100, (have / t.target_amount) * 100));
        const left = Math.max(0, t.target_amount - have);
        const done = left === 0;
        return (
          <div className="tstrip-item glass" key={t.id}>
            <svg className="tstrip-ring" viewBox="0 0 64 64" aria-hidden>
              <circle cx="32" cy="32" r={R} fill="none" stroke="var(--track)" strokeWidth="6" />
              <circle
                cx="32" cy="32" r={R} fill="none"
                stroke={done ? "var(--pos)" : "var(--orange)"}
                strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${(pct / 100) * C} ${C}`}
                transform="rotate(-90 32 32)"
              />
            </svg>
            <div className="tstrip-text">
              <div className="tstrip-name">
                {t.name}{" "}
                <span className={t.scope === "business" ? "kind-badge want" : "kind-badge"}>
                  {t.scope}
                </span>
              </div>
              <div className="tstrip-amt num">{gbp(have)} <em>of {gbp(t.target_amount)}</em></div>
              <div className={done ? "tstrip-left done" : "tstrip-left"}>
                {done ? "Reached" : `${gbp(left)} to go`}
              </div>
            </div>
            <div className="tstrip-pct num">{Math.round(pct)}<i>%</i></div>
          </div>
        );
      })}
    </div>
  );
}
