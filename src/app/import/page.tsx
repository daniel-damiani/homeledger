import { AppNav } from "@/components/AppNav";
import { ImportWizard } from "@/components/ImportWizard";
import { listAccounts } from "@/lib/accounts";
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

  const batches = await prisma.importBatch.findMany({
    where: filterAccountId ? { accountId: filterAccountId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { account: true },
  });

  // Count transactions per account for the reset panel
  const txnCounts = await prisma.transaction.groupBy({
    by: ["accountId"],
    _count: { id: true },
  });

  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));

  return (
    <main className="shell">
      <AppNav pathname="/import" />
      <h1>Import</h1>
      <ImportWizard accounts={accountOptions} />

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
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    {filterAccountId ? "No batches for this account." : "No imports yet. Try fixtures/sample-chase.csv"}
                  </td>
                </tr>
              ) : null}
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
