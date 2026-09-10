import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { Money } from "@/components/Money";
import { AccountDownloadLink } from "@/components/AccountDownloadLink";
import { SimpleFINSyncButton } from "@/components/SimpleFINSyncButton";
import { SimpleFINSyncAllButton } from "@/components/SimpleFINSyncAllButton";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { ReconcileButton } from "@/components/ReconcileButton";
import { listAccounts } from "@/lib/accounts";
import { applyDueRecurringPayments } from "@/lib/recurring";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  await applyDueRecurringPayments();
  const accounts = await listAccounts(true);

  const linkedAccounts = accounts
    .filter((a) => !a.archived && a.simpleFinId)
    .map((a) => ({ id: a.id, name: a.name }));

  // Group active accounts by type, in a meaningful display order
  const TYPE_ORDER = ["CHECKING", "SAVINGS", "CREDIT", "INVESTMENT", "LOAN", "CASH", "OTHER"] as const;
  const TYPE_LABELS: Record<string, string> = {
    CHECKING: "Checking",
    SAVINGS: "Savings",
    CREDIT: "Credit Cards",
    INVESTMENT: "Investment",
    LOAN: "Loans",
    CASH: "Cash",
    OTHER: "Other",
  };

  const activeByType = TYPE_ORDER
    .map((type) => ({
      type,
      label: TYPE_LABELS[type],
      accounts: accounts.filter((a) => !a.archived && a.type === type),
    }))
    .filter((g) => g.accounts.length > 0);

  const archived = accounts.filter((a) => a.archived);

  // Net worth components for the summary row
  const groupTotals = activeByType.map((g) => ({
    label: g.label,
    type: g.type,
    totalCents: g.accounts.reduce((s, a) => s + a.balanceCents, 0),
  }));

  return (
    <main className="shell">
      <AppNav pathname="/accounts" />
      <h1>Accounts</h1>
      <p className="lede">
        Overview and sync. Add accounts or enter transactions manually on{" "}
        <Link href="/import">Manual Import</Link>.
      </p>

      {linkedAccounts.length > 0 && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <SimpleFINSyncAllButton accounts={linkedAccounts} />
        </div>
      )}

      {/* Summary bar */}
      {groupTotals.length > 0 && (
        <div className="panel" style={{ marginBottom: "1rem", display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "baseline" }}>
          {groupTotals.map((g) => (
            <div key={g.type}>
              <div className="stat muted" style={{ fontSize: "0.75rem", marginBottom: "0.1rem" }}>{g.label}</div>
              <div className="stat" style={{ fontSize: "1rem" }}>
                <Money cents={g.totalCents} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Accounts grouped by type */}
      {activeByType.map((g) => (
        <div key={g.type} style={{ marginBottom: "1.25rem" }}>
          <h2 style={{ margin: "0 0 0.6rem", fontSize: "1rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {g.label}
          </h2>
          <div className="grid cols-3">
            {g.accounts.map((a) => (
              <section key={a.id} className="panel">
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "flex-start" }}>
                  <h3 style={{ margin: 0 }}>{a.name}</h3>
                  <DeleteAccountButton accountId={a.id} accountName={a.name} />
                </div>
                <div className="stat">
                  <Money cents={a.balanceCents} currency={a.currency} />
                </div>
                {a.availableBalanceCents != null && a.availableBalanceCents !== a.balanceCents && (
                  <p className="stat muted" style={{ fontSize: "0.85rem", marginTop: "-0.25rem" }}>
                    <Money cents={a.availableBalanceCents} currency={a.currency} /> available
                  </p>
                )}
                {a.institution && (
                  <p className="stat muted" style={{ fontSize: "0.85rem" }}>{a.institution}</p>
                )}
                {a.simpleFinId ? (
                  <SimpleFINSyncButton
                    accountId={a.id}
                    lastSyncAt={a.simpleFinLastSyncAt?.toISOString() ?? null}
                  />
                ) : (
                  <AccountDownloadLink accountId={a.id} initialUrl={a.downloadUrl ?? null} />
                )}
                <ReconcileButton accountId={a.id} accountBalanceCents={a.balanceCents} />
              </section>
            ))}
          </div>
        </div>
      ))}

      {/* Archived accounts (collapsed section) */}
      {archived.length > 0 && (
        <div style={{ marginBottom: "1.25rem" }}>
          <h2 style={{ margin: "0 0 0.6rem", fontSize: "1rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Archived
          </h2>
          <div className="grid cols-3">
            {archived.map((a) => (
              <section key={a.id} className="panel" style={{ opacity: 0.6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "flex-start" }}>
                  <h3 style={{ margin: 0 }}>{a.name}</h3>
                  <DeleteAccountButton accountId={a.id} accountName={a.name} />
                </div>
                <div className="stat"><Money cents={a.balanceCents} currency={a.currency} /></div>
                <p className="stat muted" style={{ fontSize: "0.85rem" }}>{a.type}{a.institution ? ` · ${a.institution}` : ""}</p>
              </section>
            ))}
          </div>
        </div>
      )}

    </main>
  );
}
