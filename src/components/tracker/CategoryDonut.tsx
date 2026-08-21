"use client";

import { formatMoney } from "@/lib/money";
import { useTxnDrilldown, type DrilldownParams } from "./TxnDrilldown";
import type { DrillMatch } from "./CategoryBars";

const PALETTE = [
  "#2ec4b6",
  "#5b9bd5",
  "#e6b35a",
  "#e07a6a",
  "#9b7ed9",
  "#6bcf8e",
  "#7eb8a8",
  "#d4a574",
];

export function CategoryDonut({
  rows,
  title = "Spending mix",
  from,
  to,
  kind = "spend",
  match,
}: {
  rows: { name: string; cents: number }[];
  title?: string;
  from?: string;
  to?: string;
  kind?: "spend" | "income";
  match?: DrillMatch;
}) {
  const { open } = useTxnDrilldown();
  const slice = rows.slice(0, 6);
  const other = rows.slice(6).reduce((s, r) => s + r.cents, 0);
  const total = slice.reduce((s, r) => s + r.cents, 0);
  const parts =
    other > 0 ? [...slice, { name: "Other", cents: other }] : slice;
  const sum = parts.reduce((s, r) => s + r.cents, 0) || 1;
  const canDrill = Boolean(from && to && match);

  function drill(name: string) {
    if (!from || !to || !match) return;
    const params: DrilldownParams = {
      from,
      to,
      kind,
      title: name,
    };
    if (name === "Other") {
      params.title = "Other";
      if (match === "category") params.excludeCategories = slice.map((s) => s.name);
      else if (match === "payee") params.excludePayees = slice.map((s) => s.name);
    } else if (match === "category") {
      params.category = name;
    } else if (match === "account") {
      params.account = name;
    } else {
      params.payee = name;
    }
    open(params);
  }

  const size = 160;
  const r = 58;
  const cx = size / 2;
  const cy = size / 2;
  let angle = -Math.PI / 2;

  const arcs = parts.map((p, i) => {
    const frac = p.cents / sum;
    const sweep = frac * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    angle += sweep;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    return {
      name: p.name,
      cents: p.cents,
      color: PALETTE[i % PALETTE.length],
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`,
    };
  });

  if (total === 0) {
    return (
      <section className="panel">
        <h2>{title}</h2>
        <p className="stat muted">No spending this month.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>{title}</h2>
      {canDrill && (
        <p className="stat muted" style={{ marginTop: 0 }}>
          Click a slice or label to see the transactions.
        </p>
      )}
      <div className="tracker-donut-wrap">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {arcs.map((a) => (
            <path
              key={a.name}
              d={a.d}
              fill={a.color}
              opacity={0.9}
              className={canDrill ? "drill-slice" : undefined}
              role={canDrill ? "button" : undefined}
              tabIndex={canDrill ? 0 : undefined}
              aria-label={canDrill ? `${a.name}: ${formatMoney(a.cents)}` : undefined}
              onClick={() => canDrill && drill(a.name)}
              onKeyDown={(e) => {
                if (!canDrill) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  drill(a.name);
                }
              }}
            />
          ))}
          <circle cx={cx} cy={cy} r={34} fill="var(--bg-1)" />
          <text
            x={cx}
            y={cy + 4}
            textAnchor="middle"
            className="tracker-donut-center"
          >
            {formatMoney(sum)}
          </text>
        </svg>
        <ul className="tracker-legend">
          {arcs.map((a) => (
            <li key={a.name}>
              {canDrill ? (
                <button type="button" className="drill-cell" onClick={() => drill(a.name)}>
                  <span className="swatch" style={{ background: a.color }} />
                  {a.name}{" "}
                  <span className="stat muted">{formatMoney(a.cents)}</span>
                </button>
              ) : (
                <>
                  <span className="swatch" style={{ background: a.color }} />
                  {a.name}{" "}
                  <span className="stat muted">{formatMoney(a.cents)}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
