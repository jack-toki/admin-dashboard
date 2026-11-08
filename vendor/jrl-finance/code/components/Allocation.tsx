import { gbp } from "@/lib/finance";

export default function Allocation({ savings, tax, hl }: { savings: number; tax: number; hl: number }) {
  const buckets = [
    { label: "Savings pot", val: savings, varName: "--pos", ang: -90 },
    { label: "Tax pot",     val: tax,     varName: "--c1", ang: 150 },
    { label: "HargLans ISA", val: hl,     varName: "--orange", ang: 30 },
  ];
  const total = buckets.reduce((s, b) => s + b.val, 0) || 1;
  const biggest = Math.max(...buckets.map((b) => b.val)) || 1;
  const cx = 160, cy = 126;

  const hexPath = (R: number) => {
    let p = "";
    for (let k = 0; k < 6; k++) {
      const a = ((-90 + k * 60) * Math.PI) / 180;
      p += (k ? "L" : "M") + (cx + R * Math.cos(a)).toFixed(1) + " " + (cy + R * Math.sin(a)).toFixed(1);
    }
    return p + "Z";
  };

  return (
    <>
      <svg className="alloc-svg" viewBox="0 0 320 260" role="img" aria-label="Allocation">
        {[92, 61, 30].map((R) => (
          <path key={R} d={hexPath(R)} fill="none" stroke="var(--line-strong)" strokeWidth="1" opacity="0.7" />
        ))}
        {Array.from({ length: 6 }).map((_, k) => {
          const a = ((-90 + k * 60) * Math.PI) / 180;
          return <line key={k} x1={cx} y1={cy} x2={cx + 92 * Math.cos(a)} y2={cy + 92 * Math.sin(a)}
                       stroke="var(--line-strong)" strokeWidth="1" opacity="0.6" />;
        })}
        {buckets.map((b) => {
          const color = `var(${b.varName})`;
          const r = 30 + 28 * Math.sqrt(b.val / biggest);
          const a = (b.ang * Math.PI) / 180;
          const bx = cx + 34 * Math.cos(a), by = cy + 34 * Math.sin(a);
          return (
            <g key={b.label}>
              <circle cx={bx} cy={by} r={r} fill={color} fillOpacity="0.42" stroke={color} strokeWidth="1.5" />
              <text x={bx} y={by + 4} textAnchor="middle" fontFamily="Inter Tight, system-ui, sans-serif"
                    fontSize="15" fontWeight="600" fill="var(--ink)">
                {Math.round((b.val / total) * 100)}%
              </text>
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {buckets.map((b) => (
          <div className="row" key={b.label}>
            <span className="dot" style={{ background: `var(${b.varName})` }} />
            <span>{b.label}</span>
            <span className="amt num">{gbp(b.val)}</span>
            <span className="pct">{Math.round((b.val / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </>
  );
}
