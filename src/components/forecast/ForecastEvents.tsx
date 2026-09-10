"use client";

import { formatMoney } from "@/lib/money";
import type { ForecastResult, ForecastDay } from "@/lib/forecast";

interface Props {
  result: ForecastResult;
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

// Collect all "notable" days: those with income events, bill events, or balance dips
function notableDays(days: ForecastDay[], lowThreshold: number): ForecastDay[] {
  return days.filter(
    (d) =>
      d.incomeEvents.length > 0 ||
      d.billEvents.length > 0 ||
      d.balanceCents < lowThreshold
  );
}

// Aggregate daily spend into weekly summaries for a cleaner list
function weeklySpendSummaries(
  days: ForecastDay[]
): { weekStart: string; weekEnd: string; totalSpendCents: number }[] {
  const weeks: { weekStart: string; weekEnd: string; totalSpendCents: number }[] = [];
  let i = 0;
  while (i < days.length) {
    const slice = days.slice(i, i + 7);
    const weeklyBaseline = slice.reduce((s, d) => {
      // Only count baseline spend (not income/bill days which distort the line)
      return s + d.dailySpendCents;
    }, 0);
    weeks.push({
      weekStart: slice[0].date,
      weekEnd: slice[slice.length - 1].date,
      totalSpendCents: weeklyBaseline,
    });
    i += 7;
  }
  return weeks;
}

export function ForecastEvents({ result }: Props) {
  const { days, dipsBelow, lowThresholdCents, suggestedTransferCents, suggestedTransferBy, minBalanceCents, minBalanceDate } = result;
  const notable = notableDays(days, lowThresholdCents);
  const weeklySummaries = weeklySpendSummaries(days);

  return (
    <div className="forecast-events-wrap">
      {/* ── Transfer alert ── */}
      {dipsBelow && (
        <div className={`forecast-alert ${minBalanceCents < 0 ? "error" : "warn"}`}>
          <div className="forecast-alert-icon">{minBalanceCents < 0 ? "⚠" : "!"}</div>
          <div>
            <strong>
              {minBalanceCents < 0
                ? `Balance goes negative on ${fmtDate(minBalanceDate)} (${formatMoney(minBalanceCents)})`
                : `Balance dips below ${formatMoney(lowThresholdCents)} on ${fmtDate(suggestedTransferBy ?? minBalanceDate)}`}
            </strong>
            {suggestedTransferCents > 0 && (
              <p style={{ margin: "0.25rem 0 0" }}>
                Consider transferring{" "}
                <strong>{formatMoney(suggestedTransferCents)}</strong> from savings
                {suggestedTransferBy ? ` before ${fmtDate(suggestedTransferBy)}` : ""}.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="forecast-events-cols">
        {/* ── Upcoming events ── */}
        <section className="panel forecast-events-panel">
          <h3 className="forecast-section-title">Upcoming events</h3>
          {notable.length === 0 ? (
            <p className="stat muted">No notable events in this window.</p>
          ) : (
            <div className="forecast-event-list">
              {notable.map((d) => (
                <div key={d.date} className="forecast-event-day">
                  <div className="forecast-event-date">{fmtDate(d.date)}</div>
                  <div className="forecast-event-items">
                    {d.incomeEvents.map((ev, i) => (
                      <div key={`inc-${i}`} className="forecast-event-item income">
                        <span className="forecast-event-icon">↑</span>
                        <span className="forecast-event-name">{ev.payee}</span>
                        <span className="forecast-event-amt pos">{formatMoney(ev.amountCents)}</span>
                      </div>
                    ))}
                    {d.billEvents.map((ev, i) => (
                      <div key={`bill-${i}`} className="forecast-event-item bill">
                        <span className="forecast-event-icon">↓</span>
                        <span className="forecast-event-name">{ev.name}</span>
                        <span className="forecast-event-amt neg">−{formatMoney(ev.amountCents)}</span>
                      </div>
                    ))}
                    {d.balanceCents < lowThresholdCents && (
                      <div className="forecast-event-item dip">
                        <span className="forecast-event-icon">{d.balanceCents < 0 ? "⚠" : "!"}</span>
                        <span className="forecast-event-name">
                          Balance: {formatMoney(d.balanceCents)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Weekly spend baseline ── */}
        <section className="panel forecast-events-panel">
          <h3 className="forecast-section-title">Baseline spend by week</h3>
          <p className="stat muted" style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "0.8rem" }}>
            Daily average of ${(result.dailySpendRateCents / 100).toFixed(0)}/day × 7, based on last 90 days.
          </p>
          <div className="forecast-weekly-list">
            {weeklySummaries.map((w) => {
              const pct = Math.min(100, Math.round((w.totalSpendCents / (result.dailySpendRateCents * 7 || 1)) * 100));
              return (
                <div key={w.weekStart} className="forecast-weekly-row">
                  <div className="forecast-weekly-label">
                    {w.weekStart.slice(5)} → {w.weekEnd.slice(5)}
                  </div>
                  <div className="forecast-weekly-bar-wrap">
                    <div className="forecast-weekly-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="forecast-weekly-amt">{formatMoney(w.totalSpendCents)}</div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
