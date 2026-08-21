"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import type { MonthDayData } from "@/lib/tracker";
import { useTxnDrilldown } from "./TxnDrilldown";

interface Props {
  days: MonthDayData[];
  todayDate: string; // "YYYY-MM-DD"
  avgDailySpend: number; // for color thresholds
}

export function MonthDayBars({ days, todayDate, avgDailySpend }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const { open } = useTxnDrilldown();

  const maxSpent = Math.max(...days.map((d) => d.spentCents), 1);
  const avg = avgDailySpend > 0 ? avgDailySpend : maxSpent / 2;

  function barColor(cents: number): string {
    if (cents === 0) return "var(--surface-strong)";
    if (cents <= avg * 0.7) return "var(--ok)";
    if (cents <= avg * 1.5) return "var(--amber)";
    return "var(--rose)";
  }

  const MIN_H = 3;
  const MAX_H = 90;

  return (
    <div className="month-day-bars" role="list" aria-label="Daily spending for the month">
      {days.map((day, i) => {
        const isToday = day.date === todayDate;
        const isFuture = day.date > todayDate;
        const barH = isFuture
          ? 0
          : day.spentCents === 0
          ? MIN_H
          : MIN_H + Math.round((day.spentCents / maxSpent) * (MAX_H - MIN_H));
        const isHovered = hovered === i;

        // Show day number label every 5 days (1, 6, 11, 16, 21, 26, 31)
        const showLabel = day.dayNum === 1 || day.dayNum % 5 === 1;

        return (
          <div
            key={day.date}
            className={`month-bar-col${isToday ? " today" : ""}${isFuture ? " future" : ""}${isHovered ? " hovered" : ""}`}
            role="listitem"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered(null)}
            tabIndex={isFuture ? -1 : 0}
            aria-label={
              isFuture
                ? `${day.date} — future`
                : `${day.date}: ${formatMoney(day.spentCents)} spent. Click to see transactions.`
            }
            onClick={() => {
              if (isFuture) return;
              open({
                from: day.date,
                to: day.date,
                kind: "spend",
                title: `${day.date} spending`,
              });
            }}
            onKeyDown={(e) => {
              if (isFuture) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open({
                  from: day.date,
                  to: day.date,
                  kind: "spend",
                  title: `${day.date} spending`,
                });
              }
            }}
          >
            {/* Tooltip */}
            {isHovered && !isFuture && (
              <div className={`month-tooltip${i > days.length - 8 ? " month-tooltip-left" : ""}`}>
                <div className="month-tooltip-date">{day.date.slice(5).replace("-", "/")}</div>
                <div className="month-tooltip-amount">{formatMoney(day.spentCents)}</div>
                {day.topCategory && (
                  <div className="month-tooltip-cat">{day.topCategory}</div>
                )}
                <div className="month-tooltip-count">
                  {day.txnCount} txn{day.txnCount !== 1 ? "s" : ""} · click
                </div>
              </div>
            )}

            {/* Bar */}
            <div className="month-bar-track">
              <div
                className={`month-bar${isToday ? " month-bar-today" : ""}`}
                style={{
                  height: `${barH}px`,
                  background: isFuture ? "transparent" : barColor(day.spentCents),
                }}
              />
            </div>

            {/* Day label */}
            <div className={`month-bar-label${isToday ? " month-bar-label-today" : ""}`}>
              {showLabel ? day.dayNum : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}
