"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { formatMoney } from "@/lib/money";

type TxnRow = {
  id: string;
  date: string;
  accountName: string;
  payee: string;
  categoryName: string;
  amountCents: number;
};

export type DrilldownParams = {
  from: string;
  to: string;
  kind?: "spend" | "income" | "all";
  category?: string;
  excludeCategories?: string[];
  excludePayees?: string[];
  account?: string;
  payee?: string;
  title: string;
};

type DrilldownCtx = {
  open: (params: DrilldownParams) => void;
};

const Ctx = createContext<DrilldownCtx | null>(null);

export function useTxnDrilldown(): DrilldownCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTxnDrilldown must be used within TxnDrilldownProvider");
  return ctx;
}

export function TxnDrilldownProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useState<DrilldownParams | null>(null);
  const open = useCallback((p: DrilldownParams) => setParams(p), []);
  const close = useCallback(() => setParams(null), []);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {params ? <TxnDrilldownModal params={params} onClose={close} /> : null}
    </Ctx.Provider>
  );
}

function rangeLabel(from: string, to: string): string {
  if (from === to) {
    return new Date(`${from}T12:00:00Z`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  const a = new Date(`${from}T12:00:00Z`).toLocaleDateString("en-US", opts);
  const b = new Date(`${to}T12:00:00Z`).toLocaleDateString("en-US", {
    ...opts,
    year: "numeric",
  });
  return `${a} – ${b}`;
}

function TxnDrilldownModal({
  params,
  onClose,
}: {
  params: DrilldownParams;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<TxnRow[] | null>(null);
  const [count, setCount] = useState(0);
  const [totalCents, setTotalCents] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    const ac = new AbortController();
    setRows(null);
    setError("");
    const q = new URLSearchParams({
      from: params.from,
      to: params.to,
      kind: params.kind ?? "spend",
    });
    if (params.category) q.set("category", params.category);
    if (params.account) q.set("account", params.account);
    if (params.payee) q.set("payee", params.payee);
    if (params.excludeCategories?.length) q.set("excludeCategories", params.excludeCategories.join(","));
    if (params.excludePayees?.length) q.set("excludePayees", params.excludePayees.join(","));

    fetch(`/api/tracker/transactions?${q}`, { signal: ac.signal })
      .then(async (res) => {
        const data = (await res.json()) as {
          error?: string;
          rows?: TxnRow[];
          count?: number;
          totalCents?: number;
          truncated?: boolean;
        };
        if (!res.ok) {
          setError(data.error ?? "Failed to load transactions");
          setRows([]);
          return;
        }
        setRows(data.rows ?? []);
        setCount(data.count ?? 0);
        setTotalCents(data.totalCents ?? 0);
        setTruncated(Boolean(data.truncated));
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Network error — could not load transactions.");
        setRows([]);
      });

    return () => ac.abort();
  }, [params]);

  return (
    <div className="drilldown-overlay" onClick={onClose} role="presentation">
      <div
        className="drilldown-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drilldown-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drilldown-head">
          <div>
            <h2 id="drilldown-title" className="drilldown-title">
              {params.title}
            </h2>
            <p className="stat muted drilldown-sub">{rangeLabel(params.from, params.to)}</p>
          </div>
          <button type="button" className="drilldown-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="drilldown-body">
          {rows === null && (
            <p className="stat muted" style={{ padding: "1rem 0.4rem" }}>
              Loading transactions…
            </p>
          )}
          {error && (
            <p className="tip warn" style={{ margin: "0.75rem 0.4rem" }}>
              {error}
            </p>
          )}
          {rows && !error && (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Account</th>
                    <th>Payee</th>
                    <th>Category</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5}>No transactions in this slice.</td>
                    </tr>
                  ) : (
                    rows.map((t) => (
                      <tr key={t.id}>
                        <td>{t.date}</td>
                        <td>{t.accountName}</td>
                        <td style={{ maxWidth: "16rem", wordBreak: "break-word" }}>{t.payee}</td>
                        <td>{t.categoryName}</td>
                        <td>
                          <span className={t.amountCents < 0 ? "amount neg" : t.amountCents > 0 ? "amount pos" : "amount"}>
                            {formatMoney(t.amountCents)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={4}>
                        <strong>
                          {count} transaction{count === 1 ? "" : "s"}
                          {truncated ? ` (showing first ${rows.length})` : ""}
                        </strong>
                      </td>
                      <td>
                        <strong>
                          <span className={totalCents < 0 ? "amount neg" : totalCents > 0 ? "amount pos" : "amount"}>
                            {formatMoney(totalCents)}
                          </span>
                        </strong>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
