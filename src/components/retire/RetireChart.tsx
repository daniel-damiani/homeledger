"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import type { PathPoint } from "@/lib/retirement";

const W = 900;
const H = 320;
const PAD_L = 72;
const PAD_R = 16;
const PAD_T = 24;
const PAD_B = 36;
const CHART_W = W - PAD_L - PAD_R;
const CHART_H = H - PAD_T - PAD_B;

export function RetireChart({ path }: { path: PathPoint[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (path.length < 2) return null;

  const vals = path.flatMap((p) => [p.p10, p.p50, p.p90, p.deterministic]);
  const minBal = Math.min(0, ...vals);
  const maxBal = Math.max(...vals, 1);
  const range = maxBal - minBal || 1;

  function xOf(i: number) {
    return PAD_L + (i / (path.length - 1)) * CHART_W;
  }
  function yOf(cents: number) {
    return PAD_T + ((maxBal - cents) / range) * CHART_H;
  }

  const area = [
    ...path.map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.p90).toFixed(1)}`),
    ...[...path].reverse().map((p, i) => {
      const idx = path.length - 1 - i;
      return `${xOf(idx).toFixed(1)},${yOf(p.p10).toFixed(1)}`;
    }),
  ].join(" ");

  const p50 = path.map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.p50).toFixed(1)}`).join(" ");
  const det = path.map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.deterministic).toFixed(1)}`).join(" ");

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => {
    const cents = minBal + (range / ticks) * i;
    return { cents, y: yOf(cents) };
  });

  const xLabels = path
    .map((p, i) => ({ i, label: String(p.age) }))
    .filter((_, i) => i === 0 || i % 5 === 0 || i === path.length - 1);

  const hovered = hoveredIdx != null ? path[hoveredIdx] : null;
  const hovX = hoveredIdx != null ? xOf(hoveredIdx) : 0;

  return (
    <div className="forecast-chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="forecast-chart-svg"
        onMouseLeave={() => setHoveredIdx(null)}
        role="img"
        aria-label="Retirement nest-egg fan chart"
      >
        {yTicks.map((t) => (
          <g key={t.cents}>
            <line
              x1={PAD_L}
              y1={t.y}
              x2={W - PAD_R}
              y2={t.y}
              stroke="var(--line)"
              strokeWidth="0.5"
            />
            <text x={PAD_L - 6} y={t.y + 4} textAnchor="end" fontSize="10" fill="var(--muted)">
              {t.cents >= 0
                ? `$${Math.round(t.cents / 100).toLocaleString()}`
                : `-$${Math.round(Math.abs(t.cents) / 100).toLocaleString()}`}
            </text>
          </g>
        ))}
        {xLabels.map(({ i, label }) => (
          <text key={i} x={xOf(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">
            {label}
          </text>
        ))}
        <polygon points={area} fill="var(--teal)" opacity="0.18" />
        <polyline points={p50} fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinejoin="round" />
        <polyline
          points={det}
          fill="none"
          stroke="var(--amber)"
          strokeWidth="1.5"
          strokeDasharray="5 4"
          strokeLinejoin="round"
        />
        {path.map((_, i) => (
          <rect
            key={i}
            x={xOf(i) - CHART_W / path.length / 2}
            y={PAD_T}
            width={CHART_W / path.length}
            height={CHART_H}
            fill="transparent"
            onMouseEnter={() => setHoveredIdx(i)}
          />
        ))}
        {hoveredIdx != null && hovered && (
          <g>
            <line
              x1={hovX}
              y1={PAD_T}
              x2={hovX}
              y2={PAD_T + CHART_H}
              stroke="var(--muted)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle cx={hovX} cy={yOf(hovered.p50)} r={4} fill="var(--teal)" />
          </g>
        )}
      </svg>
      {hovered && hoveredIdx != null && (
        <div
          className="forecast-tooltip"
          style={{
            left: `${Math.min(Math.max((hoveredIdx / (path.length - 1)) * 100, 5), 85)}%`,
          }}
        >
          <div className="forecast-tooltip-date">Age {hovered.age}</div>
          <div className="forecast-tooltip-balance">{formatMoney(hovered.p50)} median</div>
          <div className="forecast-tooltip-spend">p10 {formatMoney(hovered.p10)}</div>
          <div className="forecast-tooltip-spend">p90 {formatMoney(hovered.p90)}</div>
          <div className="forecast-tooltip-spend">expected {formatMoney(hovered.deterministic)}</div>
        </div>
      )}
      <div className="forecast-legend">
        <span>
          <span className="forecast-legend-line" style={{ borderColor: "var(--teal)" }} /> p10–p90
        </span>
        <span>
          <span className="forecast-legend-dot" style={{ background: "var(--teal)" }} /> Median
        </span>
        <span>
          <span className="forecast-legend-line amber" /> Expected path
        </span>
      </div>
    </div>
  );
}
