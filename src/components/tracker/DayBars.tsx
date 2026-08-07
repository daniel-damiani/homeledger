"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import type { WeekDayData } from "@/lib/tracker";

interface Props {
  days: WeekDayData[];
  todayDate: string; // "YYYY-MM-DD"
}

export function DayBars({ days, todayDate }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);

  const maxSpent = Math.max(...days.map((d) => d.spentCents), 1);
  const totalSpent = days.reduce((s, d) => s + d.spentCents, 0);
  const avgSpent = totalSpent / 7;

  function barColor(cents: number): string {
    if (cents === 0) return "var(--surface-strong)";
    if (cents <= avgSpent * 0.8) return "var(--ok)";
    if (cents <= avgSpent * 1.5) return "var(--amber)";
    return "var(--rose)";
  }

  const MIN_BAR_HEIGHT = 4; // px, shows a sliver even for zero-spend days
  const MAX_BAR_HEIGHT = 110; // px

  return (
    <div className="week-day-bars" role="list" aria-label="Daily spending">
      {days.map((day, i) => {
        const isToday = day.date === todayDate;
        const barH =
          day.spentCents === 0
            ? MIN_BAR_HEIGHT
            : MIN_BAR_HEIGHT + Math.round(((day.spentCents - 0) / maxSpent) * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT));
        const isHovered = hovered === i;

        return (
          <div
            key={day.day}
            className={`week-bar-col${isToday ? " today" : ""}${isHovered ? " hovered" : ""}`}
            role="listitem"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered(null)}
            tabIndex={0}
            aria-label={`${day.day}: ${formatMoney(day.spentCents)} spent`}
          >
            {/* Tooltip */}
            {isHovered && (
              <div className="week-tooltip">
                <div className="week-tooltip-day">{day.day} · {day.date.slice(5)}</div>
                <div className="week-tooltip-amount">{formatMoney(day.spentCents)}</div>
                {day.topCategory && (
                  <div className="week-tooltip-cat">{day.topCategory}</div>
                )}
                <div className="week-tooltip-count">{day.txnCount} txn{day.txnCount !== 1 ? "s" : ""}</div>
              </div>
            )}

            {/* Bar column */}
            <div className="week-bar-track">
              <div
                className={`week-bar${isToday ? " week-bar-today" : ""}`}
                style={{
                  height: `${barH}px`,
                  background: barColor(day.spentCents),
                }}
              />
            </div>

            {/* Amount label */}
            <div className="week-bar-amount">
              {day.spentCents > 0 ? formatMoney(day.spentCents) : "—"}
            </div>

            {/* Day label */}
            <div className={`week-bar-label${isToday ? " week-bar-label-today" : ""}`}>
              {day.day}
            </div>
          </div>
        );
      })}
    </div>
  );
}
