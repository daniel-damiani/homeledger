import { formatMoney } from "@/lib/money";
import type { WeekData } from "@/lib/tracker";

interface Props {
  current: WeekData;
  previous: WeekData;
}

interface CategoryRow {
  name: string;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
}

export function WeekComparisonTable({ current, previous }: Props) {
  const prevMap = new Map(previous.byCategory.map((c) => [c.name, c.cents]));
  const currMap = new Map(current.byCategory.map((c) => [c.name, c.cents]));
  const allCats = new Set([...currMap.keys(), ...prevMap.keys()]);

  const rows: CategoryRow[] = [...allCats]
    .map((name) => {
      const curr = currMap.get(name) ?? 0;
      const prev = prevMap.get(name) ?? 0;
      const delta = curr - prev;
      const deltaPct = prev > 0 ? Math.round((delta / prev) * 100) : null;
      return { name, current: curr, previous: prev, delta, deltaPct };
    })
    .filter((r) => r.current > 0 || r.previous > 0)
    .sort((a, b) => b.current - a.current);

  const totalCurr = current.spentCents;
  const totalPrev = previous.spentCents;
  const totalDelta = totalCurr - totalPrev;
  const totalDeltaPct = totalPrev > 0 ? Math.round((totalDelta / totalPrev) * 100) : null;

  function DeltaCell({ delta, pct }: { delta: number; pct: number | null }) {
    if (delta === 0 || Math.abs(delta) < 50) {
      return <span className="week-delta-flat">→ flat</span>;
    }
    const sign = delta > 0 ? "↑" : "↓";
    const cls = delta > 0 ? "week-delta-up" : "week-delta-down";
    return (
      <span className={cls}>
        {sign} {formatMoney(Math.abs(delta))}
        {pct !== null ? ` (${Math.abs(pct)}%)` : ""}
      </span>
    );
  }

  return (
    <div className="week-comparison">
      <table className="data week-comparison-table">
        <thead>
          <tr>
            <th>Category</th>
            <th className="num">This week</th>
            <th className="num">Last week</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td className="num">{r.current > 0 ? formatMoney(r.current) : "—"}</td>
              <td className="num muted">{r.previous > 0 ? formatMoney(r.previous) : "—"}</td>
              <td>
                <DeltaCell delta={r.delta} pct={r.deltaPct} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td><strong>Total spending</strong></td>
            <td className="num"><strong>{formatMoney(totalCurr)}</strong></td>
            <td className="num muted">{formatMoney(totalPrev)}</td>
            <td>
              <DeltaCell delta={totalDelta} pct={totalDeltaPct} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
