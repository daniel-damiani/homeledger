import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { Money } from "@/components/Money";
import { ProgressBar } from "@/components/ProgressBar";
import { CoachPanel } from "@/components/CoachPanel";
import { NetWorthChart } from "@/components/NetWorthChart";
import { getNetWorthCents, listAccounts } from "@/lib/accounts";
import { buildCoachTips } from "@/lib/coaching";
import { prisma } from "@/lib/db";
import { formatMonthKey, monthBounds } from "@/lib/money";
import { ensureSettings } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureSettings();
  const month = formatMonthKey();
  const { start, end } = monthBounds(month);
  const accounts = await listAccounts();
  const netWorth = await getNetWorthCents();
  const tips = await buildCoachTips(month);

  const budgets = await prisma.budget.findMany({
    where: { month },
    include: { category: true },
  });
  let budgetLimit = 0;
  let budgetSpent = 0;
  for (const b of budgets) {
    budgetLimit += b.limitCents;
    const spent = await prisma.transaction.aggregate({
      where: {
        categoryId: b.categoryId,
        date: { gte: start, lte: end },
        amountCents: { lt: 0 },
      },
      _sum: { amountCents: true },
    });
    budgetSpent += Math.abs(spent._sum.amountCents ?? 0);
  }

  const income = await prisma.transaction.aggregate({
    where: { date: { gte: start, lte: end }, amountCents: { gt: 0 } },
    _sum: { amountCents: true },
  });
  const expense = await prisma.transaction.aggregate({
    where: { date: { gte: start, lte: end }, amountCents: { lt: 0 } },
    _sum: { amountCents: true },
  });

  const goals = await prisma.goal.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ targetDate: "asc" }, { name: "asc" }],
  });
  const goal = goals.find((g) => g.currentCents < g.targetCents) ?? goals[0];

  return (
    <main className="shell">
      <AppNav pathname="/" />
      <h1 className="hero-brand">HomeLedger</h1>
      <p className="lede">Where your money is, what you spent, and what you&apos;re saving for — privately.</p>

      {accounts.length === 0 ? (
        <section className="panel empty-cta">
          <h2>Start with a statement</h2>
          <p className="lede" style={{ margin: "0 auto 1.25rem" }}>
            Create an account, then import a CSV/OFX from your bank. Try{" "}
            <code>fixtures/sample-chase.csv</code>.
          </p>
          <Link className="btn" href="/import">
            Import a statement
          </Link>
        </section>
      ) : (
        <>
          <div className="grid cols-3" style={{ marginBottom: "1rem" }}>
            <section className="panel">
              <h3>Net worth</h3>
              <div className="stat">
                <Money cents={netWorth} />
              </div>
              <p className="stat muted">{accounts.length} open accounts</p>
              <NetWorthChart />
            </section>
            <section className="panel">
              <h3>This month vs budget</h3>
              <div className="stat">
                <Money cents={-budgetSpent} />{" "}
                <span className="stat muted">
                  / {budgets.length ? <Money cents={-budgetLimit} /> : "no budgets"}
                </span>
              </div>
              {budgetLimit > 0 ? <ProgressBar value={budgetSpent} max={budgetLimit} /> : null}
            </section>
            <section className="panel">
              <h3>Next goal</h3>
              {goal ? (
                <>
                  <div className="stat">{goal.name}</div>
                  <p className="stat muted">
                    <Money cents={goal.currentCents} /> of <Money cents={goal.targetCents} />
                  </p>
                  <ProgressBar value={goal.currentCents} max={goal.targetCents} />
                </>
              ) : (
                <p className="stat muted">
                  No active goals. <Link href="/goals">Add one</Link>
                </p>
              )}
            </section>
          </div>

          <div className="grid cols-3" style={{ marginBottom: "1rem" }}>
            <section className="panel">
              <h3>Income ({month})</h3>
              <div className="stat">
                <Money cents={income._sum.amountCents ?? 0} />
              </div>
            </section>
            <section className="panel">
              <h3>Spending ({month})</h3>
              <div className="stat">
                <Money cents={expense._sum.amountCents ?? 0} />
              </div>
            </section>
            <section className="panel">
              <h3>Cashflow</h3>
              <div className="stat">
                <Money
                  cents={(income._sum.amountCents ?? 0) + (expense._sum.amountCents ?? 0)}
                />
              </div>
            </section>
          </div>

          <CoachPanel tips={tips} />
        </>
      )}
    </main>
  );
}