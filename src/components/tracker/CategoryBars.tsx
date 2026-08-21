"use client";

import { formatMoney } from "@/lib/money";
import { useTxnDrilldown } from "./TxnDrilldown";

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

export type DrillMatch = "category" | "account" | "payee";

export function CategoryBars({
  title,
  rows,
  maxRows = 8,
  from,
  to,
  kind = "spend",
  match,
}: {
  title: string;
  rows: { name: string; cents: number }[];
  maxRows?: number;
  from?: string;
  to?: string;
  kind?: "spend" | "income";
  match?: DrillMatch;
}) {
  const { open } = useTxnDrilldown();
  const slice = rows.slice(0, maxRows);
  const max = slice[0]?.cents || 1;
  const total = rows.reduce((s, r) => s + r.cents, 0);
  const canDrill = Boolean(from && to && match);

  function drill(name: string) {
    if (!from || !to || !match) return;
    open({
      from,
      to,
      kind,
      category: match === "category" ? name : undefined,
      account: match === "account" ? name : undefined,
      payee: match === "payee" ? name : undefined,
      title: `${name}`,
    });
  }

  if (slice.length === 0) {
    return (
      <section className="panel">
        <h2>{title}</h2>
        <p className="stat muted">Nothing to show for this month.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>{title}</h2>
      {canDrill && (
        <p className="stat muted" style={{ marginTop: 0 }}>
          Click a row to see the transactions.
        </p>
      )}
      <div className="tracker-bars">
        {slice.map((row, i) => {
          const pct = Math.round((row.cents / max) * 100);
          const share = total > 0 ? Math.round((row.cents / total) * 100) : 0;
          return (
            <button
              type="button"
              key={row.name}
              className={`tracker-bar-row${canDrill ? " drillable" : ""}`}
              onClick={canDrill ? () => drill(row.name) : undefined}
            >
              <div className="tracker-bar-meta">
                <span>{row.name}</span>
                <span className="stat muted">
                  {formatMoney(row.cents)} · {share}%
                </span>
              </div>
              <div className="tracker-bar-track">
                <span
                  style={{
                    width: `${pct}%`,
                    background: PALETTE[i % PALETTE.length],
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
