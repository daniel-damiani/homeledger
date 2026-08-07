import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { Money } from "@/components/Money";
import { CategoryBars } from "@/components/tracker/CategoryBars";
import { CategoryDonut } from "@/components/tracker/CategoryDonut";
import { CumulativeChart } from "@/components/tracker/CumulativeChart";
import { SavingsRing } from "@/components/tracker/SavingsRing";
import { StatRing } from "@/components/tracker/StatRing";
import { WeekInReview } from "@/components/tracker/WeekInReview";
import { ensureSettings } from "@/lib/auth";
import { formatMonthKey } from "@/lib/money";
import { getTrackerSnapshot, getTrackerYtdSnapshot } from "@/lib/tracker";

export const dynamic = "force-dynamic";

export default async function TrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  await ensureSettings();
  const sp = await searchParams;

  const now = new Date();
  const currentYear = now.getFullYear();
  const view = sp.view ?? "month";
  const isWeek = view === "week";
  const isYtd = view === "ytd";

  const currentMonth = formatMonthKey(now);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : currentMonth;
  const [y, m] = month.split("-").map(Number);

  const snap = isWeek
    ? null
    : isYtd
    ? await getTrackerYtdSnapshot(y, now)
    : await getTrackerSnapshot(month);

  const prev = new Date(Date.UTC(y, m - 2, 1));
  const next = new Date(Date.UTC(y, m, 1));
  const prevKey = formatMonthKey(prev);
  const nextKey = formatMonthKey(next);
  const prevYear = y - 1;
  const nextYear = y + 1;

  return (
    <main className="shell shell-wide">
      <AppNav pathname="/tracker" />
      <h1>Tracker</h1>

      {/* ── View tabs + period navigation ── */}
      <div className="tracker-view-bar">
        {!isWeek && (
          <div className="tracker-period-nav">
            {isYtd ? (
              <>
                <Link href={`/tracker?month=${y - 1}-01&view=ytd`} className="btn-ghost">← {prevYear}</Link>
                <span className="stat">{y} YTD</span>
                {nextYear <= currentYear && (
                  <Link href={`/tracker?month=${y + 1}-01&view=ytd`} className="btn-ghost">{nextYear} →</Link>
                )}
              </>
            ) : (
              <>
                <Link href={`/tracker?month=${prevKey}`} className="btn-ghost">← prev</Link>
                <span className="stat">{month}</span>
                <Link href={`/tracker?month=${nextKey}`} className="btn-ghost">next →</Link>
              </>
            )}
          </div>
        )}
        <div className="tracker-view-tabs">
          <Link
            href={`/tracker?month=${month}`}
            className={`tracker-view-tab${!isWeek && !isYtd ? " active" : ""}`}
          >
            Month
          </Link>
          <Link
            href="/tracker?view=week"
            className={`tracker-view-tab${isWeek ? " active" : ""}`}
          >
            Week
          </Link>
          <Link
            href={`/tracker?month=${month}&view=ytd`}
            className={`tracker-view-tab${isYtd ? " active" : ""}`}
          >
            YTD
          </Link>
        </div>
      </div>

      {/* ── Week in Review ── */}
      {isWeek && <WeekInReview />}

      {/* ── Month / YTD panels ── */}
      {!isWeek && snap && (
        <>
          {snap.goalCents <= 0 && (
            <p className="lede" style={{ marginTop: 0 }}>
              Set a <Link href="/goals">monthly savings goal</Link> to track pace.
            </p>
          )}

          {/* Hero: surplus */}
          <section className="panel tracker-hero">
            <div className="tracker-hero-main">
              <SavingsRing
                surplusCents={snap.surplusCents}
                goalCents={snap.isYtd ? snap.ytdGoalCents : snap.goalCents}
                progressPct={snap.progressPct}
              />
              <div>
                <h2 style={{ marginTop: 0 }}>
                  {isYtd ? `${y} surplus` : "Monthly savings"}
                </h2>
                <p className="stat muted" style={{ marginTop: 0 }}>
                  {isYtd
                    ? `Jan – ${new Date(Date.UTC(y, now.getMonth(), 1)).toLocaleString("default", { month: "short" })} · income − spending (transfers excluded)`
                    : "Surplus = income − spending (transfers excluded)"}
                </p>
                <div className="tracker-chips">
                  <div className="tracker-chip">
                    <span className="stat muted">Income</span>
                    <span className="stat amount pos"><Money cents={snap.incomeCents} /></span>
                  </div>
                  <div className="tracker-chip">
                    <span className="stat muted">Spending</span>
                    <span className="stat amount neg"><Money cents={snap.expenseCents} /></span>
                  </div>
                  <div className="tracker-chip">
                    <span className="stat muted">Remaining to goal</span>
                    <span className="stat"><Money cents={snap.remainingCents} /></span>
                  </div>
                  <div className="tracker-chip">
                    <span className="stat muted">{isYtd ? "Year elapsed" : "Month elapsed"}</span>
                    <span className="stat">{snap.monthElapsedPct}%</span>
                  </div>
                </div>
                {(snap.isYtd ? snap.ytdGoalCents : snap.goalCents) > 0 ? (
                  <p className={`tip ${snap.onPace ? "success" : "warn"}`} style={{ marginTop: "1rem" }}>
                    <strong>{snap.onPace ? "On pace" : "Behind pace"}</strong>
                    {snap.onPace
                      ? " Surplus is at or above the expected pace."
                      : " Surplus is trailing the expected pace toward your goal."}
                  </p>
                ) : null}
                {snap.uncategorizedExpenseCents > 0 ? (
                  <p className="tip warn" style={{ marginTop: "0.65rem" }}>
                    <strong>Uncategorized spending</strong>{" "}
                    <Money cents={snap.uncategorizedExpenseCents} /> — clear the{" "}
                    <Link href="/categorize">Categorize</Link> queue for cleaner charts.
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          {/* Surplus breakdown */}
          {snap.surplusCents !== 0 && (() => {
            const surplus = snap.surplusCents;
            const savings = snap.savingsDepositCents;
            const investments = snap.investmentNetCents;
            const unallocated = surplus - savings - investments;
            const absTotal = Math.abs(surplus) || 1;
            const bars: { label: string; cents: number; color: string; detail?: string }[] = [
              { label: "Net savings", cents: savings, color: "var(--amber)", detail: snap.bySavingsAccount.map(a => a.name).join(", ") || undefined },
              { label: "Investments", cents: investments, color: "var(--accent)", detail: snap.byInvestmentAccount.map(a => a.name).join(", ") || undefined },
              { label: "Unallocated", cents: unallocated, color: "var(--muted-bg, #444)" },
            ].filter(b => b.cents !== 0);
            return (
              <section className="panel" style={{ marginTop: "1rem" }}>
                <h2 style={{ marginTop: 0 }}>Surplus breakdown</h2>
                <p className="stat muted" style={{ marginTop: 0 }}>Where the surplus went — savings, investments, and what stayed liquid.</p>
                <div className="tracker-bars" style={{ maxWidth: "36rem" }}>
                  {bars.map(b => {
                    const pct = Math.round((Math.abs(b.cents) / absTotal) * 100);
                    const isNeg = b.cents < 0;
                    return (
                      <div key={b.label} className="tracker-bar-row">
                        <div className="tracker-bar-meta">
                          <span>
                            {b.label}
                            {b.detail ? <span className="stat muted" style={{ marginLeft: "0.4rem", fontSize: "0.8em" }}>({b.detail})</span> : null}
                            {isNeg ? " ↑ net outflow" : ""}
                          </span>
                          <span className="stat muted"><Money cents={b.cents} /> · {pct}%</span>
                        </div>
                        <div className="tracker-bar-track">
                          <span style={{ width: `${pct}%`, background: isNeg ? "var(--error, #e55)" : b.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })()}

          {/* Net savings ring */}
          <section className="panel" style={{ marginTop: "1rem" }}>
            <div className="tracker-hero-main">
              <StatRing
                valueCents={snap.savingsDepositCents}
                goalCents={snap.isYtd ? snap.ytdGoalCents : snap.goalCents}
                label="Net savings"
                sublabel="across SAVINGS accounts"
                colorClass={snap.savingsDepositCents >= 0 ? "amber" : "error"}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ marginTop: 0 }}>Net savings activity</h2>
                <p className="stat muted" style={{ marginTop: 0 }}>
                  Deposits minus withdrawals across all SAVINGS-type accounts.
                  {(snap.isYtd ? snap.ytdGoalCents : snap.goalCents) > 0
                    ? " Ring shows % of savings goal."
                    : " Set a monthly savings goal on Goals to show % here."}
                </p>
                {snap.bySavingsAccount.length > 0 ? (
                  <div className="tracker-bars" style={{ maxWidth: "32rem" }}>
                    {snap.bySavingsAccount.map((a) => {
                      const totalAbs = Math.abs(snap.savingsDepositCents);
                      const pct = totalAbs > 0 ? Math.round((Math.abs(a.cents) / totalAbs) * 100) : 0;
                      const isNeg = a.cents < 0;
                      return (
                        <div key={a.name} className="tracker-bar-row">
                          <div className="tracker-bar-meta">
                            <span>{a.name}{isNeg ? " (net outflow)" : ""}</span>
                            <span className="stat muted">
                              <Money cents={a.cents} /> · {pct}%
                            </span>
                          </div>
                          <div className="tracker-bar-track">
                            <span style={{ width: `${pct}%`, background: isNeg ? "var(--error, #e55)" : "var(--amber)" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="stat muted">No activity in SAVINGS accounts this period.</p>
                )}
              </div>
            </div>
          </section>

          {/* Cumulative chart */}
          <div style={{ marginTop: "1rem" }}>
            <CumulativeChart
              points={snap.cumulative}
              goalCents={snap.isYtd ? snap.ytdGoalCents : snap.goalCents}
              isYtd={snap.isYtd}
            />
          </div>

          {/* Spending breakdowns */}
          <div className="grid" style={{ gridTemplateColumns: "1.1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
            <CategoryDonut rows={snap.byCategory} title="Where spending went" />
            <CategoryBars title="By category" rows={snap.byCategory} />
          </div>

          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
            <CategoryBars title="By account (spending)" rows={snap.byAccount} maxRows={10} />
            <CategoryBars title="Top spending payees" rows={snap.byPayee} maxRows={12} />
          </div>

          {/* Income breakdowns */}
          <div className="grid" style={{ gridTemplateColumns: "1.1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
            <CategoryDonut rows={snap.byIncomePayee} title="Income sources" />
            <CategoryBars title="Income by source" rows={snap.byIncomePayee} maxRows={12} />
          </div>
        </>
      )}
    </main>
  );
}
