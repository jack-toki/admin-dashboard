"use client";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const label = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

/** Quiet reminder when a month hasn't been entered. Replaces the monthly ping. */
export default function Nudge({ missing }: { missing: string[] }) {
  if (!missing.length) return null;

  const jump = () => {
    const el = document.getElementById("entry");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.querySelector("input")?.focus({ preventScroll: true });
  };

  const text =
    missing.length === 1
      ? `${label(missing[0])} isn't in yet.`
      : `${missing.length} months aren't in yet — ${missing.map(label).join(", ")}.`;

  return (
    <div className="nudge glass" role="status">
      <span className="nudge-dot" aria-hidden />
      <span>{text}</span>
      <button className="nudge-btn" onClick={jump}>Add it</button>
    </div>
  );
}
