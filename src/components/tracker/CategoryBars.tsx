import { formatMoney } from "@/lib/money";

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

export function CategoryBars({
  title,
  rows,
  maxRows = 8,
}: {
  title: string;
  rows: { name: string; cents: number }[];
  maxRows?: number;
}) {
  const slice = rows.slice(0, maxRows);
  const max = slice[0]?.cents || 1;
  const total = rows.reduce((s, r) => s + r.cents, 0);

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
      <div className="tracker-bars">
        {slice.map((row, i) => {
          const pct = Math.round((row.cents / max) * 100);
          const share = total > 0 ? Math.round((row.cents / total) * 100) : 0;
          return (
            <div key={row.name} className="tracker-bar-row">
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
            </div>
          );
        })}
      </div>
    </section>
  );
}
