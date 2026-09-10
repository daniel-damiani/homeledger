export function ProgressBar({
  value,
  max,
}: {
  value: number;
  max: number;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const level = pct >= 100 ? "over" : pct >= 80 ? "warn" : "";
  return (
    <div className={`progress ${level}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} role="progressbar">
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}