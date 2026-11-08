"use client";
import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import { gbp } from "@/lib/finance";
import type { MonthRow } from "@/lib/data";

const cssVar = (n: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export default function GrowthChart({ rows }: { rows: MonthRow[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chart = useRef<Chart | null>(null);

  useEffect(() => {
    const draw = () => {
      if (!ref.current) return;
      chart.current?.destroy();
      chart.current = new Chart(ref.current, {
        type: "line",
        data: {
          labels: rows.map((r) => r.month_name.slice(0, 3)),
          datasets: [
            { label: "Chase", data: rows.map((r) => r.chase_total),
              borderColor: cssVar("--c1"), backgroundColor: cssVar("--c1-fill"),
              fill: true, tension: 0.35, borderWidth: 2, pointRadius: 0, stack: "s" },
            { label: "HargLans ISA", data: rows.map((r) => r.hl_contributed),
              borderColor: cssVar("--c2"), backgroundColor: cssVar("--c2-fill"),
              fill: true, tension: 0.35, borderWidth: 2, pointRadius: 0, stack: "s" },
            { label: "HargLans ISA value", data: rows.map((r) => r.hl_value),
              borderColor: cssVar("--orange"), borderDash: [5, 4], fill: false,
              tension: 0.35, borderWidth: 2.5, pointRadius: 0, spanGaps: true },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            y: { grid: { color: cssVar("--line") }, border: { display: false },
                 ticks: { color: cssVar("--muted"),
                          callback: (v) => "£" + (Number(v) / 1000) + "k",
                          font: { family: "Inter Tight" } } },
            x: { stacked: true, grid: { display: false },
                 border: { color: cssVar("--line") },
                 ticks: { color: cssVar("--muted"), font: { family: "Inter Tight" } } },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: cssVar("--tip"), titleColor: cssVar("--ink"),
              bodyColor: cssVar("--ink"), borderColor: cssVar("--line-strong"),
              borderWidth: 1, padding: 10,
              callbacks: { label: (c) => " " + c.dataset.label + ": " + gbp(Number(c.parsed.y)) },
            },
          },
        },
      });
    };
    draw();
    window.addEventListener("jrl-theme", draw);
    const mq = matchMedia("(prefers-color-scheme:dark)");
    mq.addEventListener("change", draw);
    return () => {
      window.removeEventListener("jrl-theme", draw);
      mq.removeEventListener("change", draw);
      chart.current?.destroy();
    };
  }, [rows]);

  return (
    <>
      <div className="chart-h"><canvas ref={ref} /></div>
      <div className="cl">
        <span><i style={{ background: "var(--c1)" }} />Chase</span>
        <span><i style={{ background: "var(--c2)" }} />HargLans ISA</span>
        <span><i style={{ background: "var(--orange)" }} />HargLans ISA value</span>
      </div>
    </>
  );
}
