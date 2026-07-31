import { AppNav } from "@/components/AppNav";
import { Money } from "@/components/Money";
import { AccountForm } from "@/components/AccountForm";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { ManualTxnForm } from "@/components/ManualTxnForm";
import { listAccounts } from "@/lib/accounts";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const accounts = await listAccounts(true);
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  const recent = await prisma.transaction.findMany({
    take: 25,
    orderBy: { date: "desc" },
    include: { account: true, category: true },
  });

  return (
    <main className="shell">
      <AppNav pathname="/accounts" />
      <h1>Accounts</h1>
      <p className="lede">Balances update when you import or add transactions.</p>

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

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <AccountForm />
        {accounts[0] ? (
          <ManualTxnForm
            accountId={accounts.find((a) => !a.archived)?.id ?? accounts[0].id}
            categories={categories}
          />
        ) : (
          <section className="panel">
            <p>Create an account to add manual transactions.</p>
          </section>
        )}
      </div>

      <section className="panel">
        <h2>Recent transactions</h2>
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
              {recent.map((t) => (
                <tr key={t.id}>
                  <td>{t.date.toISOString().slice(0, 10)}</td>
                  <td>{t.account.name}</td>
                  <td>{t.payee}</td>
                  <td>{t.category?.name ?? "—"}</td>
                  <td>
                    <Money cents={t.amountCents} />
                  </td>
                </tr>
              ))}
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={5}>No transactions yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}