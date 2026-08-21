"use client";

import { useState, useEffect, useCallback } from "react";
import { formatMoney, formatMonthKey, monthBounds } from "@/lib/money";
import { MonthDayBars } from "./MonthDayBars";
import { MonthComparisonTable } from "./MonthComparisonTable";
import { useTxnDrilldown } from "./TxnDrilldown";
import type { MonthReviewSnapshot, MonthReviewData } from "@/lib/tracker";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function prevMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return formatMonthKey(new Date(Date.UTC(y, m - 2, 1)));
}

function nextMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return formatMonthKey(new Date(Date.UTC(y, m, 1)));
}

function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatChip({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: "pos" | "neg" | "muted";
}) {
  return (
    <div className="week-stat-chip">
      <div className="week-stat-label">{label}</div>
      <div className={`week-stat-value${color ? ` ${color}` : ""}`}>{value}</div>
      {sub && <div className="week-stat-sub">{sub}</div>}
    </div>
  );
}

function DeltaBadge({ curr, prev, label }: { curr: number; prev: number; label?: string }) {
  const pct = deltaPct(curr, prev);
  if (pct === null) return null;
  const flat = Math.abs(pct) < 5;
  const isUp = pct > 0;
  return (
    <span className={`week-badge ${flat ? "flat" : isUp ? "up" : "down"}`}>
      {flat ? "→ flat" : `${isUp ? "↑" : "↓"} ${Math.abs(pct)}%`}
      {label && <span className="week-avg-label">{label}</span>}
    </span>
  );
}

function TopTransactions({ data }: { data: MonthReviewData }) {
  const top = data.topTxns.slice(0, 8);
  if (top.length === 0) return null;

  return (
    <section className="panel week-section">
      <h3 className="week-section-title">Biggest transactions</h3>
      <div className="week-top-txns">
        {top.map((t, i) => {
          const d = new Date(`${t.date}T12:00:00Z`);
          const dayLabel = d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          });
          return (
            <div key={i} className="week-top-txn">
              <div className="week-top-txn-rank">#{i + 1}</div>
              <div className="week-top-txn-info">
                <div className="week-top-txn-payee">{t.payee}</div>
                <div className="week-top-txn-meta">{t.category} · {dayLabel}</div>
              </div>
              <div className="week-top-txn-amount">{formatMoney(Math.abs(t.amountCents))}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TopPayees({ data }: { data: MonthReviewData }) {
  const { open } = useTxnDrilldown();
  const top = data.byPayee.slice(0, 8);
  if (top.length === 0) return null;
  const maxCents = top[0]?.cents ?? 1;
  const { start, end } = monthBounds(data.monthKey);
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);

  return (
    <section className="panel week-section">
      <h3 className="week-section-title">Top payees</h3>
      <p className="week-section-sub">Click a payee to see the transactions.</p>
      <div className="month-payee-bars">
        {top.map((p) => {
          const pct = Math.round((p.cents / maxCents) * 100);
          return (
            <button
              type="button"
              key={p.name}
              className="month-payee-row drillable"
              onClick={() =>
                open({
                  from,
                  to,
                  kind: "spend",
                  payee: p.name,
                  title: p.name,
                })
              }
            >
              <div className="month-payee-name">{p.name}</div>
              <div className="month-payee-track">
                <div className="month-payee-bar" style={{ width: `${pct}%` }} />
              </div>
              <div className="month-payee-amt">{formatMoney(p.cents)}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function MonthSkeleton() {
  return (
    <div className="week-skeleton" aria-busy="true" aria-label="Loading month data">
      <div className="skeleton-hero" />
      <div className="skeleton-bars" style={{ height: "6rem" }} />
      <div className="skeleton-table" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  /** Initial month key from the URL (?month=YYYY-MM). Defaults to current month. */
  initialMonth?: string;
}

export function MonthInReview({ initialMonth }: Props) {
  const currentMonthKey = formatMonthKey(new Date());
  const todayDate = isoDate(new Date());

  const [monthKey, setMonthKey] = useState(initialMonth ?? currentMonthKey);
  const [snap, setSnap] = useState<MonthReviewSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/tracker/month?month=${key}`);
      const data = (await res.json()) as MonthReviewSnapshot & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to load");
      } else {
        setSnap(data);
      }
    } catch {
      setError("Network error — could not load month data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(monthKey);
  }, [monthKey, load]);

  const isCurrentMonth = monthKey === currentMonthKey;
  const canGoNext = nextMonth(monthKey) <= currentMonthKey;

  // Average daily spend (for bar color thresholds)
  const avgDailySpend =
    snap && snap.current.spentCents > 0 && snap.current.byDay.length > 0
      ? Math.round(snap.current.spentCents / snap.current.byDay.filter((d) => d.spentCents > 0).length)
      : 0;

  return (
    <div className="week-in-review">
      {/* ── Month navigation ── */}
      <div className="week-nav">
        <button
          className="week-nav-btn"
          onClick={() => setMonthKey(prevMonth(monthKey))}
          aria-label="Previous month"
        >
          ←
        </button>
        <div className="week-nav-label">
          <span className="week-nav-range">{monthLabel(monthKey)}</span>
        </div>
        <button
          className="week-nav-btn"
          onClick={() => setMonthKey(nextMonth(monthKey))}
          disabled={!canGoNext}
          aria-label="Next month"
        >
          →
        </button>
        {!isCurrentMonth && (
          <button className="week-nav-today" onClick={() => setMonthKey(currentMonthKey)}>
            This month
          </button>
        )}
      </div>

      {/* ── States ── */}
      {loading && <MonthSkeleton />}
      {error && (
        <div className="panel" style={{ color: "var(--rose)", marginTop: "1rem" }}>
          {error}
        </div>
      )}

      {/* ── Content ── */}
      {!loading && snap && (
        <div className="week-content">
          {/* Hero */}
          <section className="panel week-hero">
            <p className="week-narrative">{snap.narrative}</p>
            <div className="week-stats-row">
              <StatChip
                label="Spent"
                value={formatMoney(snap.current.spentCents)}
                sub={
                  snap.previous.spentCents > 0
                    ? `vs ${formatMoney(snap.previous.spentCents)} last month`
                    : undefined
                }
                color={
                  snap.current.spentCents > snap.previous.spentCents && snap.previous.spentCents > 0
                    ? "neg"
                    : undefined
                }
              />
              <div
                className="week-stat-badge-wrap"
                style={{ flexDirection: "column", gap: "0.3rem", alignItems: "flex-start" }}
              >
                <DeltaBadge curr={snap.current.spentCents} prev={snap.previous.spentCents} />
                {snap.avg3.spentCents > 0 && (
                  <DeltaBadge
                    curr={snap.current.spentCents}
                    prev={snap.avg3.spentCents}
                    label={`${snap.avg3.monthsIncluded}-mo avg`}
                  />
                )}
              </div>
              <StatChip
                label="Income"
                value={formatMoney(snap.current.incomeCents)}
                sub={snap.avg3.incomeCents > 0 ? `avg ${formatMoney(snap.avg3.incomeCents)}/mo` : undefined}
                color={snap.current.incomeCents > 0 ? "pos" : "muted"}
              />
              <StatChip
                label="Surplus"
                value={formatMoney(snap.current.surplusCents)}
                sub={snap.avg3.surplusCents !== 0 ? `avg ${formatMoney(snap.avg3.surplusCents)}/mo` : undefined}
                color={snap.current.surplusCents >= 0 ? "pos" : "neg"}
              />
              <StatChip
                label="Transactions"
                value={String(snap.current.txnCount)}
                color="muted"
              />
            </div>
          </section>

          {/* Day-by-day bars */}
          <section className="panel week-section">
            <h3 className="week-section-title">Day by day</h3>
            <p className="week-section-sub">
              Color shows intensity relative to your average spending day — green is light, amber is elevated, red is a spike.
              Click a day to see its transactions.
            </p>
            <MonthDayBars
              days={snap.current.byDay}
              todayDate={todayDate}
              avgDailySpend={avgDailySpend}
            />
          </section>

          {/* Comparison table */}
          <section className="panel week-section">
            <h3 className="week-section-title">
              {monthLabel(snap.current.monthKey)} vs {monthLabel(snap.previous.monthKey)}
              {snap.avg3.monthsIncluded > 1 && (
                <span className="week-avg-label" style={{ marginLeft: "0.5rem" }}>
                  & {snap.avg3.monthsIncluded}-month average
                </span>
              )}
            </h3>
            <p className="week-section-sub">
              Click a category or amount to see those transactions. Prior-month amounts open that month&apos;s list.
            </p>
            <MonthComparisonTable
              current={snap.current}
              previous={snap.previous}
              avg3={snap.avg3}
            />
          </section>

          {/* Top payees */}
          <TopPayees data={snap.current} />

          {/* Biggest transactions */}
          <TopTransactions data={snap.current} />
        </div>
      )}
    </div>
  );
}
