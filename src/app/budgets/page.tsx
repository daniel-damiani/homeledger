import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { Money } from "@/components/Money";
import { ProgressBar } from "@/components/ProgressBar";
import { BudgetForm } from "@/components/BudgetForm";
import { YearlyBudgetForm } from "@/components/YearlyBudgetForm";
import { RemoveYearlyBudget } from "@/components/RemoveYearlyBudget";
import { prisma } from "@/lib/db";
import { formatMonthKey, monthBounds, ytdBounds } from "@/lib/money";
import { classifyTrackerFlow } from "@/lib/tracker";

export const dynamic = "force-dynamic";

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string; year?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const isYear = sp.view === "year";
  const month = sp.month || formatMonthKey();
  const year = Number(sp.year) || (month.match(/^(\d{4})/) ? Number(month.slice(0, 4)) : now.getFullYear());

  const categories = await prisma.category.findMany({
    where: { isIncome: false, isTransfer: false, NOT: { name: "Uncategorized" } },
    orderBy: { sortOrder: "asc" },
  });

  if (isYear) {
    const { start, end } = ytdBounds(year, now);
    const yearly = await prisma.yearlyBudget.findMany({
      where: { year },
      include: { category: true },
      orderBy: { category: { name: "asc" } },
    });
    const txns = await prisma.transaction.findMany({
      where: {
        date: { gte: start, lte: end },
        categoryId: { in: yearly.map((b) => b.categoryId) },
      },
      include: { category: true },
    });
    const spentMap = new Map<string, number>();
    for (const t of txns) {
      if (!t.categoryId) continue;
      const flow = classifyTrackerFlow(t.amountCents, t.category);
      if (flow === "spend") {
        spentMap.set(t.categoryId, (spentMap.get(t.categoryId) ?? 0) + Math.abs(t.amountCents));
      } else if (flow === "reimburse") {
        spentMap.set(t.categoryId, (spentMap.get(t.categoryId) ?? 0) - t.amountCents);
      }
    }
    const rows = yearly.map((b) => ({
      budget: b,
      spent: Math.max(0, spentMap.get(b.categoryId) ?? 0),
    }));
    const elapsedMonths = year < now.getFullYear() ? 12 : year > now.getFullYear() ? 0 : now.getMonth() + 1;

    return (
      <main className="shell">
        <AppNav pathname="/budgets" />
        <h1>Budgets</h1>
        <p className="lede">Yearly limits show on Tracker YTD. 80% warns amber; 100%+ marks over.</p>
        <BudgetViewTabs month={month} year={year} isYear />

        <div className="tracker-period-nav" style={{ marginBottom: "1rem" }}>
          <Link href={`/budgets?view=year&year=${year - 1}&month=${month}`} className="btn-ghost">
            ← {year - 1}
          </Link>
          <span className="stat">{year}</span>
          <Link href={`/budgets?view=year&year=${year + 1}&month=${month}`} className="btn-ghost">
            {year + 1} →
          </Link>
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1.2fr 1fr", gap: "1rem" }}>
          <section className="panel">
            <h2>{year} YTD</h2>
            {rows.map(({ budget: b, spent }) => {
              const expected = elapsedMonths > 0 ? Math.round((b.limitCents * elapsedMonths) / 12) : 0;
              return (
                <div key={b.id} style={{ marginBottom: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "baseline" }}>
                    <strong>{b.category.name}</strong>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span>
                        <Money cents={-spent} /> / <Money cents={-b.limitCents} />
                      </span>
                      <RemoveYearlyBudget year={year} categoryId={b.categoryId} categoryName={b.category.name} />
                    </span>
                  </div>
                  <ProgressBar value={spent} max={b.limitCents} />
                  {elapsedMonths > 0 ? (
                    <p className="stat muted" style={{ fontSize: "0.8rem", margin: "0.3rem 0 0" }}>
                      Pace through {elapsedMonths} mo: <Money cents={-expected} />
                    </p>
                  ) : null}
                </div>
              );
            })}
            {rows.length === 0 ? <p>No yearly budgets for {year} yet.</p> : null}
          </section>
          <YearlyBudgetForm year={year} categories={categories} />
        </div>
      </main>
    );
  }

  const { start, end } = monthBounds(month);
  const budgets = await prisma.budget.findMany({
    where: { month },
    include: { category: true },
    orderBy: { category: { name: "asc" } },
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
      <BudgetViewTabs month={month} year={year} isYear={false} />

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

function BudgetViewTabs({
  month,
  year,
  isYear,
}: {
  month: string;
  year: number;
  isYear: boolean;
}) {
  return (
    <div className="tracker-view-bar" style={{ marginBottom: "1rem" }}>
      <div className="tracker-view-tabs">
        <Link
          href={`/budgets?month=${month}`}
          className={`tracker-view-tab${!isYear ? " active" : ""}`}
        >
          Month
        </Link>
        <Link
          href={`/budgets?view=year&year=${year}&month=${month}`}
          className={`tracker-view-tab${isYear ? " active" : ""}`}
        >
          Year
        </Link>
      </div>
    </div>
  );
}
