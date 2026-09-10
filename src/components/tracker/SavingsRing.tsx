import { formatMoney } from "@/lib/money";

export function SavingsRing({
  surplusCents,
  goalCents,
  progressPct,
}: {
  surplusCents: number;
  goalCents: number;
  progressPct: number;
}) {
  const size = 180;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const capped = Math.min(100, Math.max(0, progressPct));
  const offset = c * (1 - capped / 100);
  const over = progressPct >= 100 && goalCents > 0;

  return (
    <div className="tracker-ring" aria-label={`Savings progress ${capped}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="tracker-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className={`tracker-ring-fill${over ? " ok" : ""}`}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="tracker-ring-label">
        <div className="stat">{formatMoney(surplusCents)}</div>
        <div className="stat muted">
          {goalCents > 0 ? `of ${formatMoney(goalCents)}` : "no goal set"}
        </div>
        <div className="stat muted">{Math.min(progressPct, 999)}%</div>
      </div>
    </div>
  );
}
