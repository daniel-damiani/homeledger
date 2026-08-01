import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { Money } from "@/components/Money";
import { AccountForm } from "@/components/AccountForm";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { ManualTxnForm } from "@/components/ManualTxnForm";
import { RecurringPaymentsPanel } from "@/components/RecurringPaymentsPanel";
import { listAccounts } from "@/lib/accounts";
import { applyDueRecurringPayments, listRecurringPayments } from "@/lib/recurring";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  await applyDueRecurringPayments();
  const accounts = await listAccounts(true);
  const active = accounts.filter((a) => !a.archived);
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  const recurring = await listRecurringPayments();

  return (
    <main className="shell">
      <AppNav pathname="/accounts" />
      <h1>Accounts</h1>
      <p className="lede">
        Manage accounts, manual entries, and recurring autopay. Browse and filter history on{" "}
        <Link href="/transactions">Transactions</Link>.
      </p>

      <div className="grid cols-3" style={{ marginBottom: "1rem" }}>
        {accounts.map((a) => (
          <section key={a.id} className="panel">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "0.75rem",
                alignItems: "flex-start",
              }}
            >
              <h3 style={{ margin: 0 }}>
                {a.name} {a.archived ? "(archived)" : ""}
              </h3>
              <DeleteAccountButton accountId={a.id} accountName={a.name} />
            </div>
            <div className="stat">
              <Money cents={a.balanceCents} currency={a.currency} />
            </div>
            <p className="stat muted">
              {a.type}
              {a.institution ? ` · ${a.institution}` : ""}
            </p>
          </section>
        ))}
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}
      >
        <AccountForm />
        {active[0] ? (
          <ManualTxnForm
            accounts={active.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
            categories={categories}
            defaultAccountId={active[0].id}
          />
        ) : (
          <section className="panel">
            <p>Create an account to add manual transactions.</p>
          </section>
        )}
      </div>

      {active.length > 0 ? (
        <div style={{ marginBottom: "1rem" }}>
          <RecurringPaymentsPanel
            accounts={active.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
            categories={categories}
            initial={recurring.map((r) => ({
              id: r.id,
              name: r.name,
              payee: r.payee,
              amountCents: r.amountCents,
              dayOfMonth: r.dayOfMonth,
              active: r.active,
              lastPostedOn: r.lastPostedOn?.toISOString() ?? null,
              fromAccount: { id: r.fromAccount.id, name: r.fromAccount.name },
              toAccount: r.toAccount
                ? { id: r.toAccount.id, name: r.toAccount.name }
                : null,
              category: r.category
                ? { id: r.category.id, name: r.category.name }
                : null,
            }))}
          />
        </div>
      ) : null}
    </main>
  );
}
