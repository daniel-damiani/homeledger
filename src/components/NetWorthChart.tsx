"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";

interface Point {
  month: string;
  netWorthCents: number;
}

export function NetWorthChart() {
  const [data, setData] = useState<Point[] | null>(null);

  useEffect(() => {
    fetch("/api/net-worth")
      .then((r) => r.json())
      .then((d: Point[]) => setData(d))
      .catch(() => {});
  }, []);

  if (!data) return <p className="stat muted" style={{ fontSize: "0.85rem" }}>Loading…</p>;
  if (data.length < 2) return null;

  const W = 560;
  const H = 120;
  const PAD = { top: 8, right: 8, bottom: 28, left: 8 };

  const values = data.map((d) => d.netWorthCents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  function xOf(i: number) {
    return PAD.left + (i / (data!.length - 1)) * innerW;
  }
  function yOf(v: number) {
    return PAD.top + innerH - ((v - min) / range) * innerH;
  }

  const points = data.map((d, i) => ({ x: xOf(i), y: yOf(d.netWorthCents), ...d }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath =
    `M${points[0].x},${PAD.top + innerH} ` +
    points.map((p) => `L${p.x},${p.y}`).join(" ") +
    ` L${points[points.length - 1].x},${PAD.top + innerH} Z`;

  // Decide which labels to show to avoid overlap (show first, last, and every ~3rd)
  const step = Math.max(1, Math.floor(points.length / 5));

  const latest = data[data.length - 1].netWorthCents;
  const oldest = data[0].netWorthCents;
  const change = latest - oldest;

  return (
    <div className="nw-chart-wrap">
      <div className="nw-chart-header">
        <span className="stat muted" style={{ fontSize: "0.8rem" }}>12-month trend</span>
        <span className={`nw-chart-change ${change >= 0 ? "pos" : "neg"}`}>
          {change >= 0 ? "+" : ""}{formatMoney(change)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="nw-chart-svg"
        aria-label="Net worth over time"
      >
        {/* Zero line */}
        {min < 0 && max > 0 && (
          <line
            x1={PAD.left} x2={W - PAD.right}
            y1={yOf(0)} y2={yOf(0)}
            stroke="rgba(232,240,242,0.18)" strokeWidth="1" strokeDasharray="3 3"
          />
        )}
        {/* Area fill */}
        <path d={areaPath} className="nw-area" />
        {/* Line */}
        <path d={linePath} className="nw-line" />
        {/* Month labels */}
        {points.map((p, i) => {
          const show = i === 0 || i === points.length - 1 || i % step === 0;
          if (!show) return null;
          return (
            <text key={i} x={p.x} y={H - 4} className="nw-label" textAnchor="middle">
              {p.month}
            </text>
          );
        })}
        {/* Dots at ends */}
        <circle cx={points[0].x} cy={points[0].y} r="3" className="nw-dot" />
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="4" className="nw-dot nw-dot-end" />
      </svg>
    </div>
  );
}
