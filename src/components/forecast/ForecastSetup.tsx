"use client";

import { useState, useEffect, useCallback } from "react";
import { formatMoney } from "@/lib/money";
import type { DetectedIncome, IncomeEntry, IncomeFrequency, ForecastResult } from "@/lib/forecast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccountOption {
  id: string;
  name: string;
  balanceCents: number;
  availableBalanceCents: number | null;
}

interface Props {
  accounts: AccountOption[];
  onResult: (result: ForecastResult) => void;
}

const FREQUENCY_LABELS: Record<IncomeFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  semimonthly: "Twice a month",
  monthly: "Monthly",
  irregular: "One-time / irregular",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function storageKey(accountId: string) {
  return `forecast:schedule:${accountId}`;
}

function saveSchedule(accountId: string, entries: IncomeEntry[]) {
  try {
    localStorage.setItem(storageKey(accountId), JSON.stringify(entries));
  } catch {
    // localStorage unavailable (SSR / privacy mode) — ignore
  }
}

function loadSchedule(accountId: string): IncomeEntry[] | null {
  try {
    const raw = localStorage.getItem(storageKey(accountId));
    return raw ? (JSON.parse(raw) as IncomeEntry[]) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Income entry editor row
// ---------------------------------------------------------------------------

function IncomeRow({
  entry,
  index,
  onChange,
  onRemove,
}: {
  entry: IncomeEntry;
  index: number;
  onChange: (idx: number, field: keyof IncomeEntry, value: string) => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div className="forecast-income-row">
      <div className="forecast-income-fields">
        <div className="form-group" style={{ flex: "1 1 10rem" }}>
          <label>Payee</label>
          <input
            value={entry.payee}
            onChange={(e) => onChange(index, "payee", e.target.value)}
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 7rem" }}>
          <label>Amount ($)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={(entry.amountCents / 100).toFixed(2)}
            onChange={(e) => onChange(index, "amountCents", e.target.value)}
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 9rem" }}>
          <label>Frequency</label>
          <select
            value={entry.frequency}
            onChange={(e) => onChange(index, "frequency", e.target.value)}
          >
            {(Object.keys(FREQUENCY_LABELS) as IncomeFrequency[]).map((f) => (
              <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ flex: "0 0 9rem" }}>
          <label>Next payday</label>
          <input
            type="date"
            value={entry.nextDate}
            onChange={(e) => onChange(index, "nextDate", e.target.value)}
          />
        </div>
      </div>
      <button
        className="btn-ghost forecast-income-remove"
        onClick={() => onRemove(index)}
        aria-label="Remove income entry"
      >
        ✕
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ForecastSetup({ accounts, onResult }: Props) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [detecting, setDetecting] = useState(false);
  const [computing, setComputing] = useState(false);
  const [detected, setDetected] = useState<DetectedIncome[] | null>(null);
  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [error, setError] = useState("");
  const [scheduleLoaded, setScheduleLoaded] = useState(false);

  // Load saved schedule when account changes
  useEffect(() => {
    if (!accountId) return;
    const saved = loadSchedule(accountId);
    if (saved && saved.length > 0) {
      setEntries(saved);
      setScheduleLoaded(true);
      setDetected(null);
    } else {
      setEntries([]);
      setScheduleLoaded(false);
      setDetected(null);
    }
  }, [accountId]);

  const detect = useCallback(async () => {
    if (!accountId) return;
    setDetecting(true);
    setError("");
    try {
      const res = await fetch("/api/forecast/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const data = (await res.json()) as DetectedIncome[];
      setDetected(data);
      // Pre-fill entries from detected patterns
      const prefilled: IncomeEntry[] = data.map((d) => ({
        payee: d.payee,
        frequency: d.frequency,
        amountCents: d.medianAmountCents,
        nextDate: d.nextDate,
      }));
      setEntries(prefilled);
      setScheduleLoaded(false);
    } catch {
      setError("Could not detect income patterns.");
    } finally {
      setDetecting(false);
    }
  }, [accountId]);

  function changeEntry(idx: number, field: keyof IncomeEntry, value: string) {
    setEntries((prev) => {
      const next = [...prev];
      if (field === "amountCents") {
        next[idx] = { ...next[idx], amountCents: Math.round(parseFloat(value || "0") * 100) };
      } else if (field === "frequency") {
        next[idx] = { ...next[idx], frequency: value as IncomeFrequency };
      } else {
        next[idx] = { ...next[idx], [field]: value };
      }
      return next;
    });
  }

  function removeEntry(idx: number) {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  }

  function addEntry() {
    const today = new Date();
    const nextFriday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + ((5 - today.getUTCDay() + 7) % 7 || 7)));
    setEntries((prev) => [
      ...prev,
      {
        payee: "Paycheck",
        frequency: "biweekly",
        amountCents: 0,
        nextDate: nextFriday.toISOString().slice(0, 10),
      },
    ]);
  }

  const generate = useCallback(async () => {
    if (!accountId || entries.length === 0) return;
    setComputing(true);
    setError("");
    try {
      const res = await fetch("/api/forecast/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, incomeSchedule: entries }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Forecast failed");
        return;
      }
      const result = (await res.json()) as ForecastResult;
      saveSchedule(accountId, entries);
      onResult(result);
    } catch {
      setError("Network error — could not generate forecast.");
    } finally {
      setComputing(false);
    }
  }, [accountId, entries, onResult]);

  const selectedAccount = accounts.find((a) => a.id === accountId);

  return (
    <div className="forecast-setup">
      {/* Account selector */}
      <section className="panel forecast-account-panel">
        <h2 style={{ marginTop: 0 }}>Select account</h2>
        <div className="forecast-account-grid">
          {accounts.map((a) => {
            const displayBalance = a.availableBalanceCents ?? a.balanceCents;
            return (
              <button
                key={a.id}
                className={`forecast-account-card${a.id === accountId ? " selected" : ""}`}
                onClick={() => setAccountId(a.id)}
              >
                <div className="forecast-account-name">{a.name}</div>
                <div className="forecast-account-balance">{formatMoney(displayBalance)}</div>
                {a.availableBalanceCents != null && a.availableBalanceCents !== a.balanceCents && (
                  <div className="forecast-account-avail">
                    {formatMoney(a.availableBalanceCents)} available
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Income schedule */}
      <section className="panel forecast-income-panel">
        <div className="forecast-income-header">
          <div>
            <h2 style={{ marginTop: 0 }}>Income schedule</h2>
            <p className="stat muted" style={{ marginTop: 0 }}>
              {scheduleLoaded
                ? "Loaded from last session — review and adjust as needed."
                : detected
                ? "Detected from your transaction history — adjust anything that looks off."
                : "Detect paychecks from your transaction history, or add them manually."}
            </p>
          </div>
          <button
            className="btn secondary"
            onClick={detect}
            disabled={detecting || !accountId}
          >
            {detecting ? "Detecting…" : "Detect income"}
          </button>
        </div>

        {detected !== null && detected.length === 0 && (
          <p className="tip warn">No recurring income detected in the last 120 days for this account. Add an entry manually.</p>
        )}

        {entries.length > 0 && (
          <div className="forecast-income-list">
            {entries.map((entry, i) => (
              <IncomeRow
                key={i}
                entry={entry}
                index={i}
                onChange={changeEntry}
                onRemove={removeEntry}
              />
            ))}
          </div>
        )}

        <button className="btn-ghost forecast-add-income" onClick={addEntry}>
          + Add income source
        </button>

        {error && <p className="tip warn" style={{ marginTop: "0.75rem" }}>{error}</p>}

        <div className="forecast-actions">
          <button
            className="btn primary"
            onClick={generate}
            disabled={computing || entries.length === 0}
          >
            {computing ? "Generating…" : "Generate 60-day forecast →"}
          </button>
          {selectedAccount && (
            <span className="stat muted">
              Starting balance: {formatMoney(selectedAccount.availableBalanceCents ?? selectedAccount.balanceCents)}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
