import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { Money } from "@/components/Money";
import { prisma } from "@/lib/db";
import { formatMonthKey, monthBounds } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function SpendingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const month = sp.month || formatMonthKey();
  const { start, end } = monthBounds(month);

  const txns = await prisma.transaction.findMany({
    where: { date: { gte: start, lte: end }, amountCents: { lt: 0 } },
    include: { category: true, account: true },
  });

  const byCategory = new Map<string, number>();
  const byPayee = new Map<string, number>();
  for (const t of txns) {
    const cat = t.category?.name ?? "Uncategorized";
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + Math.abs(t.amountCents));
    byPayee.set(t.payee, (byPayee.get(t.payee) ?? 0) + Math.abs(t.amountCents));
  }

  const catRows = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const payeeRows = [...byPayee.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

  const [y, m] = month.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  const next = new Date(Date.UTC(y, m, 1));
  const prevKey = formatMonthKey(prev);
  const nextKey = formatMonthKey(next);

  return (
    <main className="shell">
      <AppNav pathname="/spending" />
      <h1>Spending</h1>
      <p className="lede">
        Month {month} ·{" "}
        <Link href={`/spending?month=${prevKey}`}>← prev</Link> ·{" "}
        <Link href={`/spending?month=${nextKey}`}>next →</Link> ·{" "}
        <a href={`/api/export/spending?month=${month}`}>Export CSV</a>
      </p>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <section className="panel">
          <h2>By category</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Spent</th>
                </tr>
              </thead>
              <tbody>
                {catRows.map(([name, cents]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>
                      <Money cents={-cents} />
                    </td>
                  </tr>
                ))}
                {catRows.length === 0 ? (
                  <tr>
                    <td colSpan={2}>No spending this month.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <h2>Top payees</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Payee</th>
                  <th>Spent</th>
                </tr>
              </thead>
              <tbody>
                {payeeRows.map(([name, cents]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>
                      <Money cents={-cents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}