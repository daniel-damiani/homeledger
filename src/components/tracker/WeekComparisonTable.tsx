"use client";

import { formatMoney } from "@/lib/money";
import type { WeekData, WeekAverage } from "@/lib/tracker";
import { useTxnDrilldown } from "./TxnDrilldown";

interface Props {
  current: WeekData;
  previous: WeekData;
  avg13: WeekAverage;
}

interface CategoryRow {
  name: string;
  current: number;
  previous: number;
  avg: number;
  deltaVsPrev: number;
  deltaPctVsPrev: number | null;
  deltaVsAvg: number;
  deltaPctVsAvg: number | null;
}

function DeltaCell({ delta, pct }: { delta: number; pct: number | null }) {
  if (Math.abs(delta) < 50) {
    return <span className="week-delta-flat">→ flat</span>;
  }
  const isUp = delta > 0;
  const cls = isUp ? "week-delta-up" : "week-delta-down";
  return (
    <span className={cls}>
      {isUp ? "↑" : "↓"} {formatMoney(Math.abs(delta))}
      {pct !== null ? ` (${Math.abs(pct)}%)` : ""}
    </span>
  );
}

export function WeekComparisonTable({ current, previous, avg13 }: Props) {
  const { open } = useTxnDrilldown();
  const prevMap = new Map(previous.byCategory.map((c) => [c.name, c.cents]));
  const currMap = new Map(current.byCategory.map((c) => [c.name, c.cents]));
  const avgMap = new Map(avg13.byCategory.map((c) => [c.name, c.cents]));
  const allCats = new Set([...currMap.keys(), ...prevMap.keys(), ...avgMap.keys()]);

  const rows: CategoryRow[] = [...allCats]
    .map((name) => {
      const curr = currMap.get(name) ?? 0;
      const prev = prevMap.get(name) ?? 0;
      const avg = avgMap.get(name) ?? 0;
      const deltaVsPrev = curr - prev;
      const deltaVsAvg = curr - avg;
      return {
        name,
        current: curr,
        previous: prev,
        avg,
        deltaVsPrev,
        deltaPctVsPrev: prev > 0 ? Math.round((deltaVsPrev / prev) * 100) : null,
        deltaVsAvg,
        deltaPctVsAvg: avg > 0 ? Math.round((deltaVsAvg / avg) * 100) : null,
      };
    })
    .filter((r) => r.current > 0 || r.previous > 0 || r.avg > 0)
    .sort((a, b) => b.current - a.current);

  const totalCurr = current.spentCents;
  const totalPrev = previous.spentCents;
  const totalAvg = avg13.spentCents;
  const totalDeltaVsPrev = totalCurr - totalPrev;
  const totalDeltaVsAvg = totalCurr - totalAvg;
  const totalDeltaPctVsPrev = totalPrev > 0 ? Math.round((totalDeltaVsPrev / totalPrev) * 100) : null;
  const totalDeltaPctVsAvg = totalAvg > 0 ? Math.round((totalDeltaVsAvg / totalAvg) * 100) : null;

  const openCat = (name: string | undefined, from: string, to: string, periodLabel: string) => {
    open({
      from,
      to,
      kind: "spend",
      category: name,
      title: name ? `${name} · ${periodLabel}` : `Spending · ${periodLabel}`,
    });
  };

  return (
    <div className="week-comparison">
      <table className="data week-comparison-table">
        <thead>
          <tr>
            <th>Category</th>
            <th className="num">This week</th>
            <th className="num">Last week</th>
            <th>vs last week</th>
            <th className="num">
              {avg13.weeksIncluded}‑wk avg
              <span
                className="week-avg-hint"
                title={`Average over the last ${avg13.weeksIncluded} full weeks`}
              >
                ⓘ
              </span>
            </th>
            <th>vs avg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>
                <button
                  type="button"
                  className="drill-cell"
                  onClick={() => openCat(r.name, current.weekStart, current.weekEnd, "this week")}
                >
                  {r.name}
                </button>
              </td>
              <td className="num">
                {r.current > 0 ? (
                  <button
                    type="button"
                    className="drill-cell"
                    onClick={() => openCat(r.name, current.weekStart, current.weekEnd, "this week")}
                  >
                    {formatMoney(r.current)}
                  </button>
                ) : (
                  "—"
                )}
              </td>
              <td className="num muted">
                {r.previous > 0 ? (
                  <button
                    type="button"
                    className="drill-cell"
                    onClick={() => openCat(r.name, previous.weekStart, previous.weekEnd, "last week")}
                  >
                    {formatMoney(r.previous)}
                  </button>
                ) : (
                  "—"
                )}
              </td>
              <td>
                <DeltaCell delta={r.deltaVsPrev} pct={r.deltaPctVsPrev} />
              </td>
              <td className="num muted">{r.avg > 0 ? formatMoney(r.avg) : "—"}</td>
              <td>
                <DeltaCell delta={r.deltaVsAvg} pct={r.deltaPctVsAvg} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>
              <button
                type="button"
                className="drill-cell"
                onClick={() => openCat(undefined, current.weekStart, current.weekEnd, "this week")}
              >
                <strong>Total spending</strong>
              </button>
            </td>
            <td className="num">
              <button
                type="button"
                className="drill-cell"
                onClick={() => openCat(undefined, current.weekStart, current.weekEnd, "this week")}
              >
                <strong>{formatMoney(totalCurr)}</strong>
              </button>
            </td>
            <td className="num muted">
              <button
                type="button"
                className="drill-cell"
                onClick={() => openCat(undefined, previous.weekStart, previous.weekEnd, "last week")}
              >
                {formatMoney(totalPrev)}
              </button>
            </td>
            <td>
              <DeltaCell delta={totalDeltaVsPrev} pct={totalDeltaPctVsPrev} />
            </td>
            <td className="num muted">{formatMoney(totalAvg)}</td>
            <td>
              <DeltaCell delta={totalDeltaVsAvg} pct={totalDeltaPctVsAvg} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
