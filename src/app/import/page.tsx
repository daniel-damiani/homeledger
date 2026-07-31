import { AppNav } from "@/components/AppNav";
import { ImportWizard } from "@/components/ImportWizard";
import { listAccounts } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { UndoBatchButton } from "@/components/UndoBatchButton";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const accounts = await listAccounts();
  const batches = await prisma.importBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { account: true },
  });

  return (
    <main className="shell">
      <AppNav pathname="/import" />
      <h1>Import</h1>
      <ImportWizard accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Recent batches</h2>
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
                <tr key={b.id}>
                  <td>{b.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td>
                    {b.filename} ({b.format})
                    {b.undone ? " · undone" : ""}
                  </td>
                  <td>{b.account.name}</td>
                  <td>{b.importedCount}</td>
                  <td>{b.skippedCount}</td>
                  <td>{!b.undone ? <UndoBatchButton batchId={b.id} /> : null}</td>
                </tr>
              ))}
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={6}>No imports yet. Try fixtures/sample-chase.csv</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}