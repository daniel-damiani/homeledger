import { prisma } from "./db";
import { formatMonthKey, monthBounds } from "./money";

export type CoachTip = {
  id: string;
  severity: "info" | "warn" | "success";
  title: string;
  body: string;
};

export async function buildCoachTips(month = formatMonthKey()): Promise<CoachTip[]> {
  const tips: CoachTip[] = [];
  const { start, end } = monthBounds(month);

  const budgets = await prisma.budget.findMany({
    where: { month },
    include: { category: true },
  });

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
    const ratio = b.limitCents > 0 ? spent / b.limitCents : 0;
    if (ratio >= 1) {
      tips.push({
        id: `overspend-${b.id}`,
        severity: "warn",
        title: `Over budget: ${b.category.name}`,
        body: `You've spent ${Math.round(ratio * 100)}% of this month's $${(b.limitCents / 100).toFixed(0)} limit.`,
      });
    } else if (ratio >= 0.8) {
      tips.push({
        id: `warn-${b.id}`,
        severity: "warn",
        title: `Approaching limit: ${b.category.name}`,
        body: `${Math.round(ratio * 100)}% of your $${(b.limitCents / 100).toFixed(0)} budget is used.`,
      });
    }
  }

  const goals = await prisma.goal.findMany({ where: { status: "ACTIVE" } });
  const now = new Date();
  for (const g of goals) {
    if (!g.targetDate) continue;
    const totalMs = g.targetDate.getTime() - g.createdAt.getTime();
    const elapsedMs = now.getTime() - g.createdAt.getTime();
    if (totalMs <= 0) continue;
    const timeRatio = Math.min(1, Math.max(0, elapsedMs / totalMs));
    const moneyRatio = g.targetCents > 0 ? g.currentCents / g.targetCents : 0;
    if (moneyRatio + 0.05 < timeRatio && moneyRatio < 1) {
      const suggested = suggestedMonthlyContribution(g.targetCents, g.currentCents, g.targetDate);
      tips.push({
        id: `goal-behind-${g.id}`,
        severity: "warn",
        title: `Behind on “${g.name}”`,
        body: `Aim for about $${(suggested / 100).toFixed(0)}/mo to catch the target date.`,
      });
    }
  }

  const incomeAgg = await prisma.transaction.aggregate({
    where: { date: { gte: start, lte: end }, amountCents: { gt: 0 } },
    _sum: { amountCents: true },
  });
  const expenseAgg = await prisma.transaction.aggregate({
    where: { date: { gte: start, lte: end }, amountCents: { lt: 0 } },
    _sum: { amountCents: true },
  });
  const income = incomeAgg._sum.amountCents ?? 0;
  const expenses = Math.abs(expenseAgg._sum.amountCents ?? 0);
  const surplus = income - expenses;
  const primaryGoal = goals.find((g) => g.currentCents < g.targetCents);
  if (surplus > 5000 && primaryGoal) {
    tips.push({
      id: "surplus-sweep",
      severity: "success",
      title: "Surplus available to sweep",
      body: `This month's surplus is about $${(surplus / 100).toFixed(0)}. Consider sweeping toward “${primaryGoal.name}”.`,
    });
  }

  const dining = await prisma.category.findUnique({ where: { name: "Dining" } });
  const groceries = await prisma.category.findUnique({ where: { name: "Groceries" } });
  if (dining && groceries) {
    const d = await prisma.transaction.aggregate({
      where: { categoryId: dining.id, date: { gte: start, lte: end }, amountCents: { lt: 0 } },
      _sum: { amountCents: true },
    });
    const g = await prisma.transaction.aggregate({
      where: { categoryId: groceries.id, date: { gte: start, lte: end }, amountCents: { lt: 0 } },
      _sum: { amountCents: true },
    });
    const diningSpend = Math.abs(d._sum.amountCents ?? 0);
    const grocerySpend = Math.abs(g._sum.amountCents ?? 0);
    if (diningSpend > 0 && diningSpend >= grocerySpend * 0.75) {
      tips.push({
        id: "dining-save",
        severity: "info",
        title: "Dining is close to groceries",
        body: `Dining $${(diningSpend / 100).toFixed(0)} vs groceries $${(grocerySpend / 100).toFixed(0)}. One fewer takeout week could boost savings.`,
      });
    }
  }

  const creditAccounts = await prisma.account.findMany({
    where: { type: "CREDIT", archived: false },
  });
  const creditDebt = creditAccounts.reduce((s, a) => s + a.balanceCents, 0);
  if (creditDebt > 10000) {
    tips.push({
      id: "credit-focus",
      severity: "warn",
      title: "Focus on credit balances",
      body: `Card balances total $${(creditDebt / 100).toFixed(0)}. Prioritize high-interest cards before new goals.`,
    });
  }

  if (tips.length === 0) {
    tips.push({
      id: "all-clear",
      severity: "success",
      title: "Looking steady",
      body: "Budgets and goals are on track. Keep importing statements so coaching stays accurate.",
    });
  }

  return tips.slice(0, 6);
}

export function suggestedMonthlyContribution(
  targetCents: number,
  currentCents: number,
  targetDate: Date | null
): number {
  const remaining = Math.max(0, targetCents - currentCents);
  if (!targetDate) return Math.ceil(remaining / 6);
  const now = new Date();
  const months =
    (targetDate.getFullYear() - now.getFullYear()) * 12 +
    (targetDate.getMonth() - now.getMonth());
  const m = Math.max(1, months);
  return Math.ceil(remaining / m);
}