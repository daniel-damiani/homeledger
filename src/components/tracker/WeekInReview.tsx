"use client";

import { useState, useEffect, useCallback } from "react";
import { formatMoney } from "@/lib/money";
import { DayBars } from "./DayBars";
import { WeekComparisonTable } from "./WeekComparisonTable";
import type { WeekSnapshot, WeekData } from "@/lib/tracker";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toWeekMonday(date: Date): Date {
  const d = new Date(date);
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStart: string): string {
  const d = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(d);
  end.setUTCDate(d.getUTCDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startStr = d.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
  const endStr = end.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" });
  const year = end.getUTCFullYear();
  return `${startStr}–${endStr}, ${year}`;
}

function weekNumber(weekStart: string): number {
  const d = new Date(`${weekStart}T12:00:00Z`);
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86_400_000 + jan1.getUTCDay() + 1) / 7);
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

function DeltaBadge({ curr, prev }: { curr: number; prev: number }) {
  const pct = deltaPct(curr, prev);
  if (pct === null) return null;
  const isUp = pct > 0;
  const flat = Math.abs(pct) < 5;
  if (flat) return <span className="week-badge flat">→ flat</span>;
  return (
    <span className={`week-badge ${isUp ? "up" : "down"}`}>
      {isUp ? "↑" : "↓"} {Math.abs(pct)}%
    </span>
  );
}

function TopTransactions({ data }: { data: WeekData }) {
  const top = data.topTxns.slice(0, 5);
  if (top.length === 0) return null;

  return (
    <section className="panel week-section">
      <h3 className="week-section-title">Biggest transactions</h3>
      <div className="week-top-txns">
        {top.map((t, i) => {
          const d = new Date(`${t.date}T12:00:00Z`);
          const dayLabel = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
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

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function WeekSkeleton() {
  return (
    <div className="week-skeleton" aria-busy="true" aria-label="Loading week data">
      <div className="skeleton-hero" />
      <div className="skeleton-bars" />
      <div className="skeleton-table" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WeekInReview() {
  const todayDate = isoDate(new Date());
  const currentMonday = isoDate(toWeekMonday(new Date()));

  const [weekStart, setWeekStart] = useState(currentMonday);
  const [snap, setSnap] = useState<WeekSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (date: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/tracker/week?date=${date}`);
      const data = await res.json() as WeekSnapshot & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to load");
      } else {
        setSnap(data);
      }
    } catch {
      setError("Network error — could not load week data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(weekStart);
  }, [weekStart, load]);

  function goWeek(delta: -1 | 1) {
    const d = new Date(`${weekStart}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta * 7);
    const next = isoDate(toWeekMonday(d));
    setWeekStart(next);
  }

  const isCurrentWeek = weekStart === currentMonday;
  const wn = weekNumber(weekStart);

  return (
    <div className="week-in-review">
      {/* ── Week navigation ── */}
      <div className="week-nav">
        <button className="week-nav-btn" onClick={() => goWeek(-1)} aria-label="Previous week">
          ←
        </button>
        <div className="week-nav-label">
          <span className="week-nav-wn">W{wn}</span>
          <span className="week-nav-range">
            {snap ? formatWeekLabel(snap.current.weekStart) : formatWeekLabel(weekStart)}
          </span>
        </div>
        <button
          className="week-nav-btn"
          onClick={() => goWeek(1)}
          disabled={isCurrentWeek}
          aria-label="Next week"
        >
          →
        </button>
        {!isCurrentWeek && (
          <button
            className="week-nav-today"
            onClick={() => setWeekStart(currentMonday)}
          >
            This week
          </button>
        )}
      </div>

      {/* ── Loading / error states ── */}
      {loading && <WeekSkeleton />}
      {error && (
        <div className="panel" style={{ color: "var(--rose)", marginTop: "1rem" }}>
          {error}
        </div>
      )}

      {/* ── Content ── */}
      {!loading && snap && (
        <div className="week-content">
          {/* Hero panel */}
          <section className="panel week-hero">
            <p className="week-narrative">{snap.narrative}</p>
            <div className="week-stats-row">
              <StatChip
                label="Spent"
                value={formatMoney(snap.current.spentCents)}
                sub={
                  snap.previous.spentCents > 0
                    ? `vs ${formatMoney(snap.previous.spentCents)} last week`
                    : undefined
                }
                color={snap.current.spentCents > snap.previous.spentCents && snap.previous.spentCents > 0 ? "neg" : undefined}
              />
              <div className="week-stat-badge-wrap" style={{ flexDirection: "column", gap: "0.3rem", alignItems: "flex-start" }}>
                <DeltaBadge curr={snap.current.spentCents} prev={snap.previous.spentCents} />
                {snap.avg13.spentCents > 0 && (
                  <span className="week-avg-badge" title={`vs ${snap.avg13.weeksIncluded}-week average`}>
                    <DeltaBadge curr={snap.current.spentCents} prev={snap.avg13.spentCents} />
                    <span className="week-avg-label">{snap.avg13.weeksIncluded}‑wk avg</span>
                  </span>
                )}
              </div>
              <StatChip
                label="Income"
                value={formatMoney(snap.current.incomeCents)}
                sub={snap.avg13.incomeCents > 0 ? `avg ${formatMoney(snap.avg13.incomeCents)}/wk` : undefined}
                color={snap.current.incomeCents > 0 ? "pos" : "muted"}
              />
              <StatChip
                label="Surplus"
                value={formatMoney(snap.current.surplusCents)}
                sub={snap.avg13.surplusCents !== 0 ? `avg ${formatMoney(snap.avg13.surplusCents)}/wk` : undefined}
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
              Color shows intensity — green is below average, amber is elevated, red is a spike day.
              Click a day to see its transactions.
            </p>
            <DayBars days={snap.current.byDay} todayDate={todayDate} />
          </section>

          {/* This week vs last week vs 13-week average */}
          <section className="panel week-section">
            <h3 className="week-section-title">
              This week vs last week
              {snap.avg13.weeksIncluded > 1 && (
                <span className="week-avg-label" style={{ marginLeft: "0.5rem" }}>
                  & {snap.avg13.weeksIncluded}-week average
                </span>
              )}
            </h3>
            <p className="week-section-sub">
              Click a category or amount to see those transactions. Last-week amounts open last week&apos;s list.
            </p>
            <WeekComparisonTable current={snap.current} previous={snap.previous} avg13={snap.avg13} />
          </section>

          {/* Biggest transactions */}
          <TopTransactions data={snap.current} />
        </div>
      )}
    </div>
  );
}
