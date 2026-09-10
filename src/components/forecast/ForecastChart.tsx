"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import type { ForecastDay } from "@/lib/forecast";

interface Props {
  days: ForecastDay[];
  lowThresholdCents: number;
  startingBalanceCents: number;
}

const W = 900;
const H = 320;
const PAD_L = 72;
const PAD_R = 16;
const PAD_T = 24;
const PAD_B = 36;
const CHART_W = W - PAD_L - PAD_R;
const CHART_H = H - PAD_T - PAD_B;

export function ForecastChart({ days, lowThresholdCents, startingBalanceCents }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (days.length === 0) return null;

  const balances = days.map((d) => d.balanceCents);
  const minBal = Math.min(...balances, 0);
  const maxBal = Math.max(...balances, startingBalanceCents);
  const range = maxBal - minBal || 1;

  function xOf(i: number) {
    return PAD_L + (i / (days.length - 1)) * CHART_W;
  }
  function yOf(cents: number) {
    return PAD_T + ((maxBal - cents) / range) * CHART_H;
  }

  // Build SVG polyline path
  const points = days.map((d, i) => `${xOf(i).toFixed(1)},${yOf(d.balanceCents).toFixed(1)}`).join(" ");

  // Y-axis gridlines (5 ticks)
  const ticks = 5;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => {
    const cents = minBal + (range / ticks) * i;
    return { cents, y: yOf(cents) };
  });

  // Zero line
  const zeroY = yOf(0);
  const threshY = yOf(lowThresholdCents);

  // X-axis: show every 7th day label
  const xLabels = days
    .map((d, i) => ({ i, label: d.date.slice(5) }))
    .filter((_, i) => i === 0 || i % 7 === 0 || i === days.length - 1);

  const hovered = hoveredIdx !== null ? days[hoveredIdx] : null;
  const hovX = hoveredIdx !== null ? xOf(hoveredIdx) : 0;
  const hovY = hoveredIdx !== null ? yOf(days[hoveredIdx].balanceCents) : 0;

  return (
    <div className="forecast-chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="forecast-chart-svg"
        onMouseLeave={() => setHoveredIdx(null)}
        role="img"
        aria-label="60-day balance forecast chart"
      >
        {/* ─── Red zone below $0 ─── */}
        {minBal < 0 && (
          <rect
            x={PAD_L}
            y={zeroY}
            width={CHART_W}
            height={yOf(minBal) - zeroY}
            fill="var(--rose)"
            opacity="0.08"
          />
        )}

        {/* ─── Amber zone below threshold ─── */}
        {lowThresholdCents > minBal && (
          <rect
            x={PAD_L}
            y={threshY}
            width={CHART_W}
            height={Math.max(0, (minBal < 0 ? zeroY : yOf(minBal)) - threshY)}
            fill="var(--amber)"
            opacity="0.10"
          />
        )}

        {/* ─── Gridlines ─── */}
        {yTicks.map((t) => (
          <g key={t.cents}>
            <line
              x1={PAD_L}
              y1={t.y}
              x2={W - PAD_R}
              y2={t.y}
              stroke="var(--border)"
              strokeWidth="0.5"
            />
            <text
              x={PAD_L - 6}
              y={t.y + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--muted)"
            >
              {t.cents >= 0 ? `$${Math.round(t.cents / 100).toLocaleString()}` : `-$${Math.round(Math.abs(t.cents) / 100).toLocaleString()}`}
            </text>
          </g>
        ))}

        {/* ─── Zero line ─── */}
        {minBal < 0 && (
          <line x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY} stroke="var(--rose)" strokeWidth="1" strokeDasharray="4 3" />
        )}

        {/* ─── Low threshold line ─── */}
        {lowThresholdCents > minBal && lowThresholdCents < maxBal && (
          <>
            <line
              x1={PAD_L}
              y1={threshY}
              x2={W - PAD_R}
              y2={threshY}
              stroke="var(--amber)"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
            <text x={W - PAD_R + 2} y={threshY + 4} fontSize="9" fill="var(--amber)" textAnchor="start">
              low
            </text>
          </>
        )}

        {/* ─── X-axis labels ─── */}
        {xLabels.map(({ i, label }) => (
          <text key={i} x={xOf(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">
            {label}
          </text>
        ))}

        {/* ─── Balance line ─── */}
        <polyline
          points={points}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* ─── Income event markers (up arrows) ─── */}
        {days.map((d, i) =>
          d.incomeEvents.length > 0 ? (
            <g key={`inc-${i}`}>
              <circle cx={xOf(i)} cy={yOf(d.balanceCents)} r={4} fill="var(--ok)" stroke="var(--surface)" strokeWidth="1.5" />
            </g>
          ) : null
        )}

        {/* ─── Bill event markers (down arrows) ─── */}
        {days.map((d, i) =>
          d.billEvents.length > 0 ? (
            <g key={`bill-${i}`}>
              <circle cx={xOf(i)} cy={yOf(d.balanceCents)} r={4} fill="var(--rose)" stroke="var(--surface)" strokeWidth="1.5" />
            </g>
          ) : null
        )}

        {/* ─── Hover interaction layer ─── */}
        {days.map((_, i) => (
          <rect
            key={i}
            x={xOf(i) - CHART_W / days.length / 2}
            y={PAD_T}
            width={CHART_W / days.length}
            height={CHART_H}
            fill="transparent"
            onMouseEnter={() => setHoveredIdx(i)}
          />
        ))}

        {/* ─── Hover crosshair + dot ─── */}
        {hoveredIdx !== null && (
          <g>
            <line x1={hovX} y1={PAD_T} x2={hovX} y2={PAD_T + CHART_H} stroke="var(--muted)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={hovX} cy={hovY} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
      </svg>

      {/* ─── Hover tooltip ─── */}
      {hovered && hoveredIdx !== null && (
        <div
          className="forecast-tooltip"
          style={{
            left: `${Math.min(Math.max((hoveredIdx / (days.length - 1)) * 100, 5), 85)}%`,
          }}
        >
          <div className="forecast-tooltip-date">{hovered.date}</div>
          <div className="forecast-tooltip-balance">{formatMoney(hovered.balanceCents)}</div>
          {hovered.incomeEvents.map((ev, j) => (
            <div key={j} className="forecast-tooltip-income">
              ↑ {ev.payee}: {formatMoney(ev.amountCents)}
            </div>
          ))}
          {hovered.billEvents.map((ev, j) => (
            <div key={j} className="forecast-tooltip-bill">
              ↓ {ev.name}: {formatMoney(ev.amountCents)}
            </div>
          ))}
          <div className="forecast-tooltip-spend">
            ≈ {formatMoney(hovered.dailySpendCents)}/day baseline
          </div>
        </div>
      )}

      {/* ─── Legend ─── */}
      <div className="forecast-legend">
        <span><span className="forecast-legend-dot" style={{ background: "var(--ok)" }} /> Income</span>
        <span><span className="forecast-legend-dot" style={{ background: "var(--rose)" }} /> Bill</span>
        <span><span className="forecast-legend-line amber" /> Low balance zone</span>
        {minBal < 0 && <span><span className="forecast-legend-line red" /> Negative balance</span>}
      </div>
    </div>
  );
}
