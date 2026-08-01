import { formatMoney } from "@/lib/money";

export function CumulativeChart({
  points,
  goalCents,
  isYtd = false,
}: {
  points: { label: string; surplusCents: number }[];
  goalCents: number;
  isYtd?: boolean;
}) {
  if (points.length === 0) {
    return (
      <section className="panel">
        <h2>Surplus over {isYtd ? "the year" : "the month"}</h2>
        <p className="stat muted">No transactions yet.</p>
      </section>
    );
  }

  const w = 640;
  const h = 200;
  const pad = { t: 16, r: 12, b: 28, l: 48 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  const values = points.map((p) => p.surplusCents);
  if (goalCents > 0) values.push(goalCents);
  const minV = Math.min(0, ...values);
  const maxV = Math.max(0, ...values, goalCents > 0 ? goalCents : 1);
  const span = maxV - minV || 1;

  const x = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * innerW;
  const y = (cents: number) => pad.t + innerH - ((cents - minV) / span) * innerH;

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.surplusCents).toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;

  const zeroY = y(0);
  const goalY = goalCents > 0 ? y(goalCents) : null;
  const last = points[points.length - 1];

  // Label ticks: first, last, and evenly spaced in between (max 6)
  const tickIndices = new Set<number>([0, points.length - 1]);
  const step = Math.max(1, Math.floor(points.length / 5));
  for (let i = step; i < points.length - 1; i += step) tickIndices.add(i);

  return (
    <section className="panel">
      <h2>Surplus over {isYtd ? "the year" : "the month"}</h2>
      <p className="stat muted" style={{ marginTop: 0 }}>
        Running income − spending (transfers excluded) · now{" "}
        {formatMoney(last.surplusCents)}
      </p>
      <svg
        className="tracker-chart"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Cumulative surplus chart"
      >
        <line x1={pad.l} x2={w - pad.r} y1={zeroY} y2={zeroY} className="tracker-chart-axis" />
        {goalY != null ? (
          <line x1={pad.l} x2={w - pad.r} y1={goalY} y2={goalY} className="tracker-chart-goal" />
        ) : null}
        <path d={area} className="tracker-chart-area" />
        <path d={line} className="tracker-chart-line" fill="none" />
        {[...tickIndices].map((i) => (
          <text key={i} x={x(i).toFixed(1)} y={h - 6} textAnchor="middle" className="tracker-chart-label">
            {points[i].label}
          </text>
        ))}
        {goalCents > 0 && goalY != null ? (
          <text x={w - pad.r} y={goalY - 4} textAnchor="end" className="tracker-chart-label">
            Goal {formatMoney(goalCents)}
          </text>
        ) : null}
      </svg>
    </section>
  );
}
