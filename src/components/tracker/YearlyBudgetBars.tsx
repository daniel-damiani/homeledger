"use client";

import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { ProgressBar } from "@/components/ProgressBar";
import { useTxnDrilldown } from "./TxnDrilldown";
import type { YearlyBudgetProgress } from "@/lib/tracker";

export function YearlyBudgetBars({
  rows,
  elapsedMonths,
  from,
  to,
  year,
}: {
  rows: YearlyBudgetProgress[];
  elapsedMonths: number;
  from?: string;
  to?: string;
  year: number;
}) {
  const { open } = useTxnDrilldown();
  const canDrill = Boolean(from && to);
  const paceDenom = Math.max(1, elapsedMonths);

  if (rows.length === 0) {
    return (
      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Yearly budgets</h2>
        <p className="stat muted" style={{ marginTop: 0 }}>
          No yearly category limits for {year}.{" "}
          <Link href={`/budgets?view=year&year=${year}`}>Set them on Budgets</Link> to track YTD vs an annual cap.
        </p>
      </section>
    );
  }

  return (
    <section className="panel" style={{ marginTop: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Yearly budgets</h2>
      <p className="stat muted" style={{ marginTop: 0 }}>
        YTD spend vs annual limit. Pace assumes the limit is spread evenly across 12 months.
        {canDrill ? " Click a category to see the transactions." : null}{" "}
        <Link href={`/budgets?view=year&year=${year}`}>Edit</Link>
      </p>
      <div className="yearly-budget-list">
        {rows.map((row) => {
          const pct = row.limitCents > 0 ? Math.round((row.spentCents / row.limitCents) * 100) : 0;
          const expected = Math.round((row.limitCents * paceDenom) / 12);
          const remaining = row.limitCents - row.spentCents;
          const onPace = row.spentCents <= expected;
          return (
            <button
              type="button"
              key={row.name}
              className={`yearly-budget-row${canDrill ? " drillable" : ""}`}
              onClick={
                canDrill
                  ? () =>
                      open({
                        from: from!,
                        to: to!,
                        kind: "spend",
                        category: row.name,
                        title: row.name,
                      })
                  : undefined
              }
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                <strong>{row.name}</strong>
                <span>
                  {formatMoney(row.spentCents)} / {formatMoney(row.limitCents)}
                  <span className="stat muted"> · {pct}%</span>
                </span>
              </div>
              <ProgressBar value={row.spentCents} max={row.limitCents} />
              <div className="stat muted" style={{ fontSize: "0.8rem", marginTop: "0.35rem" }}>
                {remaining >= 0 ? `${formatMoney(remaining)} left` : `${formatMoney(-remaining)} over`}
                {" · "}
                <span className={onPace ? "" : "amount neg"}>
                  {onPace ? "On pace" : "Over pace"} vs {formatMoney(expected)} expected by now
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
