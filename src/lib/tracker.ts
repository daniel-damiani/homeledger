import { prisma } from "./db";
import { clamp, formatMonthKey, monthBounds } from "./money";

export type NamedAmount = { name: string; cents: number };

export type TrackerSnapshot = {
  label: string;
  isYtd: boolean;
  goalCents: number;
  /** Monthly target × months elapsed (YTD pace target). 0 in month view. */
  ytdGoalCents: number;
  incomeCents: number;
  expenseCents: number;
  surplusCents: number;
  remainingCents: number;
  progressPct: number;
  monthElapsedPct: number;
  onPace: boolean;
  byCategory: NamedAmount[];
  byAccount: NamedAmount[];
  byPayee: NamedAmount[];
  byIncomePayee: NamedAmount[];
  /** Net change in SAVINGS-type accounts (deposits minus withdrawals). */
  savingsDepositCents: number;
  bySavingsAccount: NamedAmount[];
  /** Net Transfer-categorized cash into INVESTMENT-type accounts. */
  investmentNetCents: number;
  byInvestmentAccount: NamedAmount[];
  /** Daily cumulative surplus (month view) or monthly cumulative surplus (YTD view). */
  cumulative: { label: string; surplusCents: number }[];
  uncategorizedExpenseCents: number;
};

function isTransferCat(cat: { isTransfer: boolean } | null | undefined): boolean {
  return Boolean(cat?.isTransfer);
}

/**
 * Normalise a raw payee string into a grouping key.
 * Strips trailing reference numbers / IDs that differ per transaction.
 * Example: "AIR CAN 0142333025721 XXX NY" → "AIR CAN"
 */
export function payeeGroupKey(payee: string): string {
  let s = payee.trim().toUpperCase();
  s = s.replace(/\s+\d{5,}\s*/g, " ");
  s = s.replace(/\bX{3,}\b(\s+\S+)?/g, "");
  s = s.replace(/[^A-Z0-9&'./ -]/g, " ").replace(/\s{2,}/g, " ").trim();
  const tokens = s.split(/\s+/);
  const out: string[] = [];
  for (const tok of tokens) {
    if (/\d/.test(tok)) break;
    out.push(tok);
  }
  const result = out.join(" ").trim();
  return result.length >= 2 ? result : payee.trim().slice(0, 30).toUpperCase();
}

function monthPace(month: string, now = new Date()): { daysInMonth: number; elapsedDay: number } {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const currentKey = formatMonthKey(now);
  if (month < currentKey) return { daysInMonth, elapsedDay: daysInMonth };
  if (month > currentKey) return { daysInMonth, elapsedDay: 0 };
  return { daysInMonth, elapsedDay: now.getDate() };
}

async function aggregate(start: Date, end: Date) {
  const txns = await prisma.transaction.findMany({
    where: { date: { gte: start, lte: end } },
    include: { category: true, account: true },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  // Include both deposits and withdrawals so we show net savings change
  const savingsTxns = await prisma.transaction.findMany({
    where: { date: { gte: start, lte: end }, account: { type: "SAVINGS" } },
    include: { account: true },
  });

  // Cash explicitly moved from liquid accounts into investments (ACH deposits to brokerage etc.).
  // Only "Transfer" category — excludes 401k contributions which come from payroll, not surplus.
  const investmentTxns = await prisma.transaction.findMany({
    where: {
      date: { gte: start, lte: end },
      account: { type: "INVESTMENT" },
      category: { isTransfer: true, name: "Transfer" },
    },
    include: { account: true },
  });

  let incomeCents = 0;
  let expenseCents = 0;
  let uncategorizedExpenseCents = 0;
  let savingsDepositCents = 0;
  let investmentNetCents = 0;
  const byCategory = new Map<string, number>();
  const byAccount = new Map<string, number>();
  const byPayee = new Map<string, number>();
  const byIncomePayee = new Map<string, number>();
  const bySavingsAccountMap = new Map<string, number>();
  const byInvestmentAccountMap = new Map<string, number>();

  for (const t of savingsTxns) {
    savingsDepositCents += t.amountCents;
    bySavingsAccountMap.set(t.account.name, (bySavingsAccountMap.get(t.account.name) ?? 0) + t.amountCents);
  }

  for (const t of investmentTxns) {
    investmentNetCents += t.amountCents;
    byInvestmentAccountMap.set(t.account.name, (byInvestmentAccountMap.get(t.account.name) ?? 0) + t.amountCents);
  }

  for (const t of txns) {
    if (isTransferCat(t.category)) continue;
    if (t.amountCents > 0) {
      incomeCents += t.amountCents;
      const k = payeeGroupKey(t.payee);
      byIncomePayee.set(k, (byIncomePayee.get(k) ?? 0) + t.amountCents);
    } else if (t.amountCents < 0) {
      const spent = Math.abs(t.amountCents);
      expenseCents += spent;
      if (!t.category || t.category.name === "Uncategorized") uncategorizedExpenseCents += spent;
      const cat = t.category?.name ?? "Uncategorized";
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + spent);
      byAccount.set(t.account.name, (byAccount.get(t.account.name) ?? 0) + spent);
      const pk = payeeGroupKey(t.payee);
      byPayee.set(pk, (byPayee.get(pk) ?? 0) + spent);
    }
  }

  const sortDesc = (map: Map<string, number>): NamedAmount[] =>
    [...map.entries()].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);

  return {
    incomeCents,
    expenseCents,
    uncategorizedExpenseCents,
    savingsDepositCents,
    investmentNetCents,
    byCategory: sortDesc(byCategory),
    byAccount: sortDesc(byAccount),
    byPayee: sortDesc(byPayee).slice(0, 12),
    byIncomePayee: sortDesc(byIncomePayee).slice(0, 12),
    bySavingsAccount: sortDesc(bySavingsAccountMap),
    byInvestmentAccount: sortDesc(byInvestmentAccountMap),
    rawTxns: txns,
  };
}

export async function getTrackerSnapshot(month = formatMonthKey()): Promise<TrackerSnapshot> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  const goalCents = settings?.monthlySavingsGoalCents ?? 0;
  const { start, end } = monthBounds(month);

  const data = await aggregate(start, end);
  const { incomeCents, expenseCents } = data;
  const surplusCents = incomeCents - expenseCents;
  const remainingCents = Math.max(0, goalCents - surplusCents);
  const progressPct = goalCents > 0 ? clamp(Math.round((surplusCents / goalCents) * 100), 0, 999) : 0;

  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const { elapsedDay } = monthPace(month);
  const monthElapsedPct = daysInMonth > 0 ? clamp(Math.round((elapsedDay / daysInMonth) * 100), 0, 100) : 0;
  const expectedByNow = goalCents > 0 && daysInMonth > 0 ? Math.round((goalCents * elapsedDay) / daysInMonth) : 0;
  const onPace = goalCents <= 0 || surplusCents >= expectedByNow;

  // Daily cumulative
  const dailyNet = new Array(daysInMonth + 1).fill(0) as number[];
  for (const t of data.rawTxns) {
    if (isTransferCat(t.category)) continue;
    const day = t.date.getUTCDate();
    if (day >= 1 && day <= daysInMonth) dailyNet[day] += t.amountCents;
  }
  let running = 0;
  const cumulative: { label: string; surplusCents: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    running += dailyNet[d];
    cumulative.push({ label: String(d), surplusCents: running });
  }

  return {
    label: month,
    isYtd: false,
    goalCents,
    ytdGoalCents: 0,
    incomeCents,
    expenseCents,
    surplusCents,
    remainingCents,
    progressPct,
    monthElapsedPct,
    onPace,
    byCategory: data.byCategory,
    byAccount: data.byAccount,
    byPayee: data.byPayee,
    byIncomePayee: data.byIncomePayee,
    savingsDepositCents: data.savingsDepositCents,
    bySavingsAccount: data.bySavingsAccount,
    investmentNetCents: data.investmentNetCents,
    byInvestmentAccount: data.byInvestmentAccount,
    cumulative,
    uncategorizedExpenseCents: data.uncategorizedExpenseCents,
  };
}

export async function getTrackerYtdSnapshot(year: number, now = new Date()): Promise<TrackerSnapshot> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  const goalCents = settings?.monthlySavingsGoalCents ?? 0;

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  const endMonth = year < currentYear ? 11 : currentMonth;

  // YTD pace: goal × elapsed months (partial month counts as 1)
  const elapsedMonths = endMonth + 1;
  const ytdGoalCents = goalCents * elapsedMonths;

  // Aggregate each month separately for the cumulative chart
  let totalIncome = 0;
  let totalExpense = 0;
  let totalUncategorized = 0;
  let totalSavings = 0;
  let totalInvestment = 0;
  const byCategoryMap = new Map<string, number>();
  const byAccountMap = new Map<string, number>();
  const byPayeeMap = new Map<string, number>();
  const byIncomePayeeMap = new Map<string, number>();
  const bySavingsMap = new Map<string, number>();
  const byInvestmentMap = new Map<string, number>();
  const cumulative: { label: string; surplusCents: number }[] = [];
  let running = 0;

  for (let mo = 0; mo <= endMonth; mo++) {
    const { start, end } = monthBounds(`${year}-${String(mo + 1).padStart(2, "0")}`);
    const data = await aggregate(start, end);
    totalIncome += data.incomeCents;
    totalExpense += data.expenseCents;
    totalUncategorized += data.uncategorizedExpenseCents;
    totalSavings += data.savingsDepositCents;
    totalInvestment += data.investmentNetCents;
    for (const { name, cents } of data.byCategory) byCategoryMap.set(name, (byCategoryMap.get(name) ?? 0) + cents);
    for (const { name, cents } of data.byAccount) byAccountMap.set(name, (byAccountMap.get(name) ?? 0) + cents);
    for (const { name, cents } of data.byPayee) byPayeeMap.set(name, (byPayeeMap.get(name) ?? 0) + cents);
    for (const { name, cents } of data.byIncomePayee) byIncomePayeeMap.set(name, (byIncomePayeeMap.get(name) ?? 0) + cents);
    for (const { name, cents } of data.bySavingsAccount) bySavingsMap.set(name, (bySavingsMap.get(name) ?? 0) + cents);
    for (const { name, cents } of data.byInvestmentAccount) byInvestmentMap.set(name, (byInvestmentMap.get(name) ?? 0) + cents);
    running += data.incomeCents - data.expenseCents;
    const monthLabel = new Date(Date.UTC(year, mo, 1)).toLocaleString("default", { month: "short" });
    cumulative.push({ label: monthLabel, surplusCents: running });
  }

  const surplusCents = totalIncome - totalExpense;
  const remainingCents = Math.max(0, ytdGoalCents - surplusCents);
  const progressPct = ytdGoalCents > 0 ? clamp(Math.round((surplusCents / ytdGoalCents) * 100), 0, 999) : 0;
  const onPace = ytdGoalCents <= 0 || surplusCents >= ytdGoalCents;

  const sortDesc = (map: Map<string, number>): NamedAmount[] =>
    [...map.entries()].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);

  return {
    label: `${year} YTD`,
    isYtd: true,
    goalCents,
    ytdGoalCents,
    incomeCents: totalIncome,
    expenseCents: totalExpense,
    surplusCents,
    remainingCents,
    progressPct,
    monthElapsedPct: Math.round((elapsedMonths / 12) * 100),
    onPace,
    byCategory: sortDesc(byCategoryMap),
    byAccount: sortDesc(byAccountMap),
    byPayee: sortDesc(byPayeeMap).slice(0, 12),
    byIncomePayee: sortDesc(byIncomePayeeMap).slice(0, 12),
    savingsDepositCents: totalSavings,
    bySavingsAccount: sortDesc(bySavingsMap),
    investmentNetCents: totalInvestment,
    byInvestmentAccount: sortDesc(byInvestmentMap),
    cumulative,
    uncategorizedExpenseCents: totalUncategorized,
  };
}
