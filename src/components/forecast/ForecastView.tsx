"use client";

import { useState, useCallback } from "react";
import { ForecastSetup } from "./ForecastSetup";
import { ForecastChart } from "./ForecastChart";
import { ForecastEvents } from "./ForecastEvents";
import { formatMoney } from "@/lib/money";
import type { ForecastResult } from "@/lib/forecast";

interface AccountOption {
  id: string;
  name: string;
  balanceCents: number;
  availableBalanceCents: number | null;
}

interface Props {
  accounts: AccountOption[];
}

export function ForecastView({ accounts }: Props) {
  const [result, setResult] = useState<ForecastResult | null>(null);

  const handleResult = useCallback((r: ForecastResult) => {
    setResult(r);
    // Scroll to chart
    setTimeout(() => {
      document.getElementById("forecast-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, []);

  return (
    <div className="forecast-root">
      <ForecastSetup accounts={accounts} onResult={handleResult} />

      {result && (
        <div id="forecast-result" className="forecast-result">
          {/* Summary bar */}
          <div className="panel forecast-summary-bar">
            <div className="forecast-summary-item">
              <span className="stat muted">Account</span>
              <span className="stat">{result.accountName}</span>
            </div>
            <div className="forecast-summary-item">
              <span className="stat muted">Starting balance</span>
              <span className="stat">{formatMoney(result.startingBalanceCents)}</span>
            </div>
            <div className="forecast-summary-item">
              <span className="stat muted">Variable spend</span>
              <span className="stat">{formatMoney(result.dailySpendRateCents)}/day</span>
            </div>
            <div className="forecast-summary-item">
              <span className="stat muted">Bills tracked</span>
              <span className="stat">{result.billsDetected}</span>
            </div>
            <div className="forecast-summary-item">
              <span className="stat muted">60-day low</span>
              <span className={`stat ${result.minBalanceCents < 0 ? "neg" : result.minBalanceCents < result.lowThresholdCents ? "amount" : ""}`}>
                {formatMoney(result.minBalanceCents)}
              </span>
            </div>
            <button
              className="btn-ghost"
              onClick={() => setResult(null)}
              style={{ marginLeft: "auto", alignSelf: "center" }}
            >
              ← Adjust
            </button>
          </div>

          {/* Chart */}
          <section className="panel" style={{ marginTop: "1rem" }}>
            <h2 style={{ marginTop: 0 }}>60-day balance forecast</h2>
            <p className="stat muted" style={{ marginTop: 0 }}>
              Hover over the line for daily detail. Green dots = income, red dots = recurring bills. The line also accounts for estimated variable spending of {formatMoney(result.dailySpendRateCents)}/day.
            </p>
            <ForecastChart
              days={result.days}
              lowThresholdCents={result.lowThresholdCents}
              startingBalanceCents={result.startingBalanceCents}
            />
          </section>

          {/* Events + alert */}
          <div style={{ marginTop: "1rem" }}>
            <ForecastEvents result={result} />
          </div>
        </div>
      )}
    </div>
  );
}
