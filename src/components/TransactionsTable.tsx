"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Money } from "@/components/Money";
import { ApplyToLoanButton } from "@/components/ApplyToLoanButton";

export type TransactionRow = {
  id: string;
  date: string;
  accountName: string;
  accountType: string;
  payee: string;
  categoryId: string | null;
  categoryName: string | null;
  amountCents: number;
  loanMirrorId: string | null;
};

export function TransactionsTable({
  rows,
  loanAccounts,
  categories,
}: {
  rows: TransactionRow[];
  loanAccounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [localCat, setLocalCat] = useState<Record<string, string>>({});

  async function saveCategory(txnId: string, categoryId: string) {
    setSaving(txnId);
    try {
      await fetch("/api/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txnId, categoryId, always: false }),
      });
      setLocalCat((prev) => ({ ...prev, [txnId]: categoryId }));
      router.refresh();
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Date</th>
            <th>Account</th>
            <th>Payee</th>
            <th>Category</th>
            <th>Amount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const canLink =
              t.amountCents < 0 &&
              t.accountType !== "LOAN" &&
              t.accountType !== "CREDIT" &&
              loanAccounts.length > 0;
            const currentCatId = localCat[t.id] ?? t.categoryId ?? "";
            return (
              <tr key={t.id}>
                <td>{t.date}</td>
                <td>{t.accountName}</td>
                <td style={{ maxWidth: "18rem", wordBreak: "break-word" }}>{t.payee}</td>
                <td>
                  <select
                    value={currentCatId}
                    disabled={saving === t.id}
                    style={{
                      font: "inherit",
                      fontSize: "0.88rem",
                      color: "var(--ink)",
                      background: "var(--bg-2)",
                      border: "1px solid var(--line)",
                      borderRadius: "8px",
                      padding: "0.3rem 0.5rem",
                      maxWidth: "11rem",
                    }}
                    onChange={(e) => void saveCategory(t.id, e.target.value)}
                  >
                    <option value="">— uncategorized —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <Money cents={t.amountCents} />
                </td>
                <td>
                  {canLink ? (
                    <ApplyToLoanButton
                      txnId={t.id}
                      alreadyLinked={Boolean(t.loanMirrorId)}
                      loanAccounts={loanAccounts}
                    />
                  ) : t.loanMirrorId ? (
                    <span className="stat muted">Linked to loan</span>
                  ) : null}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6}>No transactions match these filters.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
