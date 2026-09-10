"use client";

import { formatMoney, monthBounds } from "@/lib/money";
import type { MonthReviewData, MonthAvg } from "@/lib/tracker";
import { useTxnDrilldown } from "./TxnDrilldown";

interface Props {
  current: MonthReviewData;
  previous: MonthReviewData;
  avg3: MonthAvg;
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function DeltaCell({ delta, pct }: { delta: number; pct: number | null }) {
  if (Math.abs(delta) < 100) {
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

function monthIsoRange(monthKey: string): { from: string; to: string } {
  const { start, end } = monthBounds(monthKey);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function MonthComparisonTable({ current, previous, avg3 }: Props) {
  const { open } = useTxnDrilldown();
  const prevMap = new Map(previous.byCategory.map((c) => [c.name, c.cents]));
  const currMap = new Map(current.byCategory.map((c) => [c.name, c.cents]));
  const avgMap = new Map(avg3.byCategory.map((c) => [c.name, c.cents]));
  const allCats = new Set([...currMap.keys(), ...prevMap.keys(), ...avgMap.keys()]);

  const rows = [...allCats]
    .map((name) => {
      const curr = currMap.get(name) ?? 0;
      const prev = prevMap.get(name) ?? 0;
      const avg = avgMap.get(name) ?? 0;
      const dVsPrev = curr - prev;
      const dVsAvg = curr - avg;
      return {
        name,
        curr,
        prev,
        avg,
        dVsPrev,
        pVsPrev: prev > 0 ? Math.round((dVsPrev / prev) * 100) : null,
        dVsAvg,
        pVsAvg: avg > 0 ? Math.round((dVsAvg / avg) * 100) : null,
      };
    })
    .filter((r) => r.curr !== 0 || r.prev !== 0 || r.avg !== 0)
    .sort((a, b) => b.curr - a.curr);

  const tCurr = current.spentCents;
  const tPrev = previous.spentCents;
  const tAvg = avg3.spentCents;
  const tDVsPrev = tCurr - tPrev;
  const tDVsAvg = tCurr - tAvg;

  const prevLbl = monthLabel(previous.monthKey);
  const currLbl = monthLabel(current.monthKey);
  const avgLbl = `${avg3.monthsIncluded}-mo avg`;

  const currRange = monthIsoRange(current.monthKey);
  const prevRange = monthIsoRange(previous.monthKey);

  const openCat = (name: string | undefined, range: { from: string; to: string }, periodLabel: string) => {
    open({
      from: range.from,
      to: range.to,
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
            <th className="num">{currLbl}</th>
            <th className="num">{prevLbl}</th>
            <th>vs {prevLbl}</th>
            <th className="num">
              {avgLbl}
              <span className="week-avg-hint" title={`Average over the last ${avg3.monthsIncluded} months`}>ⓘ</span>
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
                  onClick={() => openCat(r.name, currRange, currLbl)}
                >
                  {r.name}
                </button>
              </td>
              <td className="num">
                {r.curr !== 0 ? (
                  <button
                    type="button"
                    className="drill-cell"
                    onClick={() => openCat(r.name, currRange, currLbl)}
                  >
                    {formatMoney(r.curr)}
                  </button>
                ) : (
                  "—"
                )}
              </td>
              <td className="num muted">
                {r.prev !== 0 ? (
                  <button
                    type="button"
                    className="drill-cell"
                    onClick={() => openCat(r.name, prevRange, prevLbl)}
                  >
                    {formatMoney(r.prev)}
                  </button>
                ) : (
                  "—"
                )}
              </td>
              <td><DeltaCell delta={r.dVsPrev} pct={r.pVsPrev} /></td>
              <td className="num muted">{r.avg !== 0 ? formatMoney(r.avg) : "—"}</td>
              <td><DeltaCell delta={r.dVsAvg} pct={r.pVsAvg} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>
              <button type="button" className="drill-cell" onClick={() => openCat(undefined, currRange, currLbl)}>
                <strong>Total spending</strong>
              </button>
            </td>
            <td className="num">
              <button type="button" className="drill-cell" onClick={() => openCat(undefined, currRange, currLbl)}>
                <strong>{formatMoney(tCurr)}</strong>
              </button>
            </td>
            <td className="num muted">
              <button type="button" className="drill-cell" onClick={() => openCat(undefined, prevRange, prevLbl)}>
                {formatMoney(tPrev)}
              </button>
            </td>
            <td><DeltaCell delta={tDVsPrev} pct={tPrev > 0 ? Math.round((tDVsPrev / tPrev) * 100) : null} /></td>
            <td className="num muted">{formatMoney(tAvg)}</td>
            <td><DeltaCell delta={tDVsAvg} pct={tAvg > 0 ? Math.round((tDVsAvg / tAvg) * 100) : null} /></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
