import { AppNav } from "@/components/AppNav";
import { Money } from "@/components/Money";
import { ProgressBar } from "@/components/ProgressBar";
import { BudgetForm } from "@/components/BudgetForm";
import { prisma } from "@/lib/db";
import { formatMonthKey, monthBounds } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const month = sp.month || formatMonthKey();
  const { start, end } = monthBounds(month);

  const budgets = await prisma.budget.findMany({
    where: { month },
    include: { category: true },
    orderBy: { category: { name: "asc" } },
  });

  const categories = await prisma.category.findMany({
    where: { isIncome: false, isTransfer: false, NOT: { name: "Uncategorized" } },
    orderBy: { sortOrder: "asc" },
  });

  const rows = [];
  for (const b of budgets) {
    const spentAgg = await prisma.transaction.aggregate({
      where: {
        categoryId: b.categoryId,
        date: { gte: start, lte: end },
        amountCents: { lt: 0 },
      },
      _sum: { amountCents: true },
    });
    const spent = Math.abs(spentAgg._sum.amountCents ?? 0);
    rows.push({ budget: b, spent });
  }

  return (
    <main className="shell">
      <AppNav pathname="/budgets" />
      <h1>Budgets</h1>
      <p className="lede">80% warns amber; 100%+ marks over.</p>

      <div className="grid" style={{ gridTemplateColumns: "1.2fr 1fr", gap: "1rem" }}>
        <section className="panel">
          <h2>{month}</h2>
          {rows.map(({ budget: b, spent }) => (
            <div key={b.id} style={{ marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{b.category.name}</strong>
                <span>
                  <Money cents={-spent} /> / <Money cents={-b.limitCents} />
                </span>
              </div>
              <ProgressBar value={spent} max={b.limitCents} />
            </div>
          ))}
          {rows.length === 0 ? <p>No budgets for this month yet.</p> : null}
        </section>
        <BudgetForm month={month} categories={categories} />
      </div>
    </main>
  );
}