import { AppNav } from "@/components/AppNav";
import { ImportWizard } from "@/components/ImportWizard";
import { AccountForm } from "@/components/AccountForm";
import { ManualTxnForm } from "@/components/ManualTxnForm";
import { RecurringPaymentsPanel } from "@/components/RecurringPaymentsPanel";
import { listAccounts } from "@/lib/accounts";
import { listRecurringPayments } from "@/lib/recurring";
import { prisma } from "@/lib/db";
import { UndoBatchButton } from "@/components/UndoBatchButton";
import { ResetAccountImportsButton } from "@/components/ResetAccountImportsButton";
import { BatchFilterBar } from "@/components/BatchFilterBar";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const { account: filterAccountId = "" } = await searchParams;

  const accounts = await listAccounts();
  const active = accounts.filter((a) => !a.archived);
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  const recurring = await listRecurringPayments();

  const batches = await prisma.importBatch.findMany({
    where: filterAccountId ? { accountId: filterAccountId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { account: true },
  });

  const txnCounts = await prisma.transaction.groupBy({
    by: ["accountId"],
    _count: { id: true },
  });

  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));

  return (
    <main className="shell">
      <AppNav pathname="/import" />
      <h1>Manual Import</h1>

      {/* ── File import ──────────────────────────────────────────────── */}
      <ImportWizard accounts={accountOptions} />

      {/* ── Manual entry ─────────────────────────────────────────────── */}
      <div
        className="grid"
        style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem", marginBottom: "1rem" }}
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
            <p>Create an account first to add manual transactions.</p>
          </section>
        )}
      </div>

      {/* ── Recurring autopay ────────────────────────────────────────── */}
      {active.length > 0 && (
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
              toAccount: r.toAccount ? { id: r.toAccount.id, name: r.toAccount.name } : null,
              category: r.category ? { id: r.category.id, name: r.category.name } : null,
            }))}
          />
        </div>
      )}

      {/* ── Import history ───────────────────────────────────────────── */}
      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Import batches</h2>
        <Suspense>
          <BatchFilterBar accounts={accountOptions} currentAccountId={filterAccountId} />
        </Suspense>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>File</th>
                <th>Account</th>
                <th>Imported</th>
                <th>Skipped</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} style={b.undone ? { opacity: 0.5 } : undefined}>
                  <td>{b.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td>
                    {b.filename} ({b.format})
                    {b.undone ? <span className="stat muted" style={{ marginLeft: "0.4rem" }}>undone</span> : null}
                  </td>
                  <td>{b.account.name}</td>
                  <td>{b.importedCount}</td>
                  <td>{b.skippedCount}</td>
                  <td>{!b.undone ? <UndoBatchButton batchId={b.id} /> : null}</td>
                </tr>
              ))}
              {batches.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    {filterAccountId ? "No batches for this account." : "No imports yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {batches.length > 0 && (
          <p className="tip" style={{ marginTop: "0.5rem" }}>
            {batches.length} batch{batches.length !== 1 ? "es" : ""} shown
            {filterAccountId ? ` for ${accounts.find((a) => a.id === filterAccountId)?.name ?? "selected account"}` : " across all accounts"}
          </p>
        )}
      </section>

      {/* ── Reset account ────────────────────────────────────────────── */}
      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Reset account</h2>
        <p className="tip">
          Deletes <em>all</em> transactions for an account and restores it to its opening balance.
          Import a fresh file first so category history is preserved, then reset the old data here.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>Account</th>
              <th>Transactions</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const count = txnCounts.find((c) => c.accountId === a.id)?._count.id ?? 0;
              return (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{count}</td>
                  <td>
                    {count > 0 ? (
                      <ResetAccountImportsButton accountId={a.id} accountName={a.name} />
                    ) : (
                      <span className="stat muted" style={{ fontSize: "0.8rem" }}>No transactions</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
