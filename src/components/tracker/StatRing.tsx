import { formatMoney } from "@/lib/money";

export function StatRing({
  valueCents,
  goalCents,
  label,
  sublabel,
  colorClass = "",
  size = 180,
}: {
  valueCents: number;
  goalCents: number;
  label: string;
  sublabel?: string;
  /** Extra CSS class on the fill circle — use "ok", "amber", etc. */
  colorClass?: string;
  size?: number;
}) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = goalCents > 0 ? Math.min(100, Math.max(0, (valueCents / goalCents) * 100)) : 0;
  const offset = c * (1 - pct / 100);

  return (
    <div className="tracker-ring" aria-label={`${label} ${Math.round(pct)}%`}>
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
          className={`tracker-ring-fill${colorClass ? ` ${colorClass}` : ""}`}
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
        <div className="stat">{formatMoney(valueCents)}</div>
        {sublabel ? <div className="stat muted">{sublabel}</div> : null}
        {goalCents > 0 ? (
          <div className="stat muted">{Math.round(pct)}% of goal</div>
        ) : null}
      </div>
    </div>
  );
}
