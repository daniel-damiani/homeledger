import { prisma } from "./db";
import { clamp, formatMonthKey, monthBounds, formatMoney, shiftMonthKey } from "./money";

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

// ---------------------------------------------------------------------------
// Week in Review
// ---------------------------------------------------------------------------

export type WeekDayData = {
  day: string;       // "Mon", "Tue", …
  date: string;      // "2026-08-03"
  spentCents: number;
  incomeCents: number;
  txnCount: number;
  topCategory: string;
};

export type WeekData = {
  weekStart: string;  // ISO date of Monday
  weekEnd: string;    // ISO date of Sunday
  spentCents: number;
  incomeCents: number;
  surplusCents: number;
  txnCount: number;
  byDay: WeekDayData[];
  byCategory: NamedAmount[];
  topTxns: { payee: string; amountCents: number; category: string; date: string }[];
};

/** 13-week average — one entry per category (or overall) */
export type WeekAverage = {
  /** Number of full weeks included in the average (up to 13, skipping the current week). */
  weeksIncluded: number;
  spentCents: number;          // average weekly spend
  incomeCents: number;         // average weekly income
  surplusCents: number;        // average weekly surplus
  byCategory: NamedAmount[];   // average spend per category per week
};

export type WeekSnapshot = {
  current: WeekData;
  previous: WeekData;
  /** 13-week (≈3-month) rolling average, excluding the current week. */
  avg13: WeekAverage;
  narrative: string;
};

/** Snap any date back to its Monday (UTC). */
export function toWeekMonday(date: Date): Date {
  const d = new Date(date);
  const dow = d.getUTCDay(); // 0 = Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

async function aggregateWeek(monday: Date): Promise<WeekData> {
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);

  const txns = await prisma.transaction.findMany({
    where: { date: { gte: monday, lte: sunday } },
    include: { category: true },
    orderBy: { amountCents: "asc" }, // most negative first for topTxns
  });

  let spentCents = 0;
  let incomeCents = 0;
  const byCategoryMap = new Map<string, number>();
  const byDaySpent = new Array(7).fill(0) as number[];
  const byDayIncome = new Array(7).fill(0) as number[];
  const byDayCount = new Array(7).fill(0) as number[];
  const byDayCat = new Array(7).fill("") as string[];
  const byDayCatMax = new Array(7).fill(0) as number[];

  for (const t of txns) {
    if (isTransferCat(t.category)) continue;
    const dow = t.date.getUTCDay(); // 0=Sun
    const dayIdx = dow === 0 ? 6 : dow - 1; // Mon=0 … Sun=6

    if (t.amountCents < 0) {
      const spent = Math.abs(t.amountCents);
      spentCents += spent;
      byDaySpent[dayIdx] += spent;
      byDayCount[dayIdx] += 1;
      const cat = t.category?.name ?? "Uncategorized";
      byCategoryMap.set(cat, (byCategoryMap.get(cat) ?? 0) + spent);
      if (spent > byDayCatMax[dayIdx]) {
        byDayCatMax[dayIdx] = spent;
        byDayCat[dayIdx] = cat;
      }
    } else if (t.amountCents > 0) {
      incomeCents += t.amountCents;
      byDayIncome[dayIdx] += t.amountCents;
    }
  }

  const byDay: WeekDayData[] = DAY_NAMES.map((day, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return {
      day,
      date: d.toISOString().slice(0, 10),
      spentCents: byDaySpent[i],
      incomeCents: byDayIncome[i],
      txnCount: byDayCount[i],
      topCategory: byDayCat[i],
    };
  });

  const sortDesc = (map: Map<string, number>): NamedAmount[] =>
    [...map.entries()].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);

  // Top 5 expense transactions (most negative = largest spend)
  const topTxns = txns
    .filter((t) => t.amountCents < 0 && !isTransferCat(t.category))
    .slice(0, 5)
    .map((t) => ({
      payee: t.payee,
      amountCents: t.amountCents,
      category: t.category?.name ?? "Uncategorized",
      date: t.date.toISOString().slice(0, 10),
    }));

  return {
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
    spentCents,
    incomeCents,
    surplusCents: incomeCents - spentCents,
    txnCount: txns.filter((t) => !isTransferCat(t.category)).length,
    byDay,
    byCategory: sortDesc(byCategoryMap),
    topTxns,
  };
}

export function buildNarrative(current: WeekData, previous: WeekData): string {
  const prevSpent = previous.spentCents;
  const currSpent = current.spentCents;

  if (currSpent === 0 && prevSpent === 0) {
    return current.incomeCents > 0
      ? `Income of ${formatMoney(current.incomeCents)} with no spending — great week.`
      : "No transactions recorded this week yet.";
  }

  const lines: string[] = [];

  if (prevSpent > 0) {
    const deltaPct = Math.round(((currSpent - prevSpent) / prevSpent) * 100);
    if (deltaPct <= -20) {
      lines.push(`Quiet week — you spent ${Math.abs(deltaPct)}% less than last week.`);
    } else if (deltaPct >= 20) {
      lines.push(`Heavier week — spending up ${deltaPct}% vs last week.`);
    } else {
      lines.push(`Spending is roughly on par with last week.`);
    }

    // Find the biggest category spike vs last week
    const prevCatMap = new Map(previous.byCategory.map((c) => [c.name, c.cents]));
    let biggestSpike = { name: "", pct: 0 };
    for (const cat of current.byCategory) {
      const prev = prevCatMap.get(cat.name) ?? 0;
      if (prev > 0 && cat.cents > 0) {
        const pct = Math.round(((cat.cents - prev) / prev) * 100);
        if (pct > biggestSpike.pct) biggestSpike = { name: cat.name, pct };
      }
    }
    if (biggestSpike.pct >= 40) {
      lines.push(`Watch out — ${biggestSpike.name} is up ${biggestSpike.pct}% this week.`);
    }
  } else if (currSpent > 0) {
    lines.push(`${formatMoney(currSpent)} spent this week.`);
  }

  if (current.surplusCents > 0) {
    lines.push(`Strong surplus of ${formatMoney(current.surplusCents)} this week.`);
  } else if (current.surplusCents < 0) {
    lines.push(`Spending exceeded income by ${formatMoney(Math.abs(current.surplusCents))} this week.`);
  }

  return lines.join(" ") || "Here's your week at a glance.";
}

/**
 * Compute a rolling average over the 13 full weeks ending the Sunday before `monday`.
 * Uses a single DB query covering the whole 13-week window — no per-week round-trips.
 */
async function compute13WeekAverage(monday: Date): Promise<WeekAverage> {
  const WEEKS = 13;
  // Window: [monday - 13*7 days, monday - 1 ms)
  const windowEnd = new Date(monday.getTime() - 1);
  const windowStart = new Date(monday);
  windowStart.setUTCDate(monday.getUTCDate() - WEEKS * 7);

  const txns = await prisma.transaction.findMany({
    where: { date: { gte: windowStart, lte: windowEnd } },
    include: { category: true },
  });

  // Collect which weeks actually have data so we use a real week count (not assume 13)
  const weeksWithData = new Set<string>();
  let totalSpent = 0;
  let totalIncome = 0;
  const byCategoryTotal = new Map<string, number>();

  for (const t of txns) {
    if (isTransferCat(t.category)) continue;
    // Identify the week by its Monday date string
    const wm = toWeekMonday(t.date);
    weeksWithData.add(wm.toISOString().slice(0, 10));

    if (t.amountCents < 0) {
      const spent = Math.abs(t.amountCents);
      totalSpent += spent;
      const cat = t.category?.name ?? "Uncategorized";
      byCategoryTotal.set(cat, (byCategoryTotal.get(cat) ?? 0) + spent);
    } else if (t.amountCents > 0) {
      totalIncome += t.amountCents;
    }
  }

  const n = Math.max(weeksWithData.size, 1);

  const byCategory: NamedAmount[] = [...byCategoryTotal.entries()]
    .map(([name, cents]) => ({ name, cents: Math.round(cents / n) }))
    .sort((a, b) => b.cents - a.cents);

  return {
    weeksIncluded: n,
    spentCents: Math.round(totalSpent / n),
    incomeCents: Math.round(totalIncome / n),
    surplusCents: Math.round((totalIncome - totalSpent) / n),
    byCategory,
  };
}

export async function getWeekSnapshot(weekDate: Date): Promise<WeekSnapshot> {
  const monday = toWeekMonday(weekDate);
  const prevMonday = new Date(monday);
  prevMonday.setUTCDate(monday.getUTCDate() - 7);

  const [current, previous, avg13] = await Promise.all([
    aggregateWeek(monday),
    aggregateWeek(prevMonday),
    compute13WeekAverage(monday),
  ]);

  return { current, previous, avg13, narrative: buildNarrative(current, previous) };
}

// ---------------------------------------------------------------------------
// Month in Review
// ---------------------------------------------------------------------------

export type MonthDayData = {
  date: string;       // "2026-08-05"
  dayNum: number;     // 5
  spentCents: number;
  incomeCents: number;
  txnCount: number;
  topCategory: string;
};

export type MonthReviewData = {
  monthKey: string;   // "2026-08"
  spentCents: number;
  incomeCents: number;
  surplusCents: number;
  txnCount: number;
  byCategory: NamedAmount[];
  byPayee: NamedAmount[];
  byDay: MonthDayData[];
  topTxns: { payee: string; amountCents: number; category: string; date: string }[];
};

/** 3-month rolling average */
export type MonthAvg = {
  monthsIncluded: number;
  spentCents: number;
  incomeCents: number;
  surplusCents: number;
  byCategory: NamedAmount[];
};

export type MonthReviewSnapshot = {
  current: MonthReviewData;
  previous: MonthReviewData;
  avg3: MonthAvg;
  narrative: string;
};

async function aggregateMonthForReview(monthKey: string): Promise<MonthReviewData> {
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const daysInMonth = end.getUTCDate();

  const txns = await prisma.transaction.findMany({
    where: { date: { gte: start, lte: end } },
    include: { category: true },
    orderBy: { amountCents: "asc" }, // most negative first for topTxns
  });

  let spentCents = 0;
  let incomeCents = 0;
  const byCategoryMap = new Map<string, number>();
  const byPayeeMap = new Map<string, number>();
  const byDaySpent = new Array(daysInMonth).fill(0) as number[];
  const byDayIncome = new Array(daysInMonth).fill(0) as number[];
  const byDayCount = new Array(daysInMonth).fill(0) as number[];
  const byDayCat = new Array(daysInMonth).fill("") as string[];
  const byDayCatMax = new Array(daysInMonth).fill(0) as number[];

  for (const t of txns) {
    if (isTransferCat(t.category)) continue;
    const dayIdx = t.date.getUTCDate() - 1; // 0-indexed

    if (t.amountCents < 0) {
      const spent = Math.abs(t.amountCents);
      spentCents += spent;
      byDaySpent[dayIdx] += spent;
      byDayCount[dayIdx] += 1;
      const cat = t.category?.name ?? "Uncategorized";
      byCategoryMap.set(cat, (byCategoryMap.get(cat) ?? 0) + spent);
      const payeeKey = payeeGroupKey(t.payee);
      byPayeeMap.set(payeeKey, (byPayeeMap.get(payeeKey) ?? 0) + spent);
      if (spent > byDayCatMax[dayIdx]) {
        byDayCatMax[dayIdx] = spent;
        byDayCat[dayIdx] = cat;
      }
    } else if (t.amountCents > 0) {
      incomeCents += t.amountCents;
      byDayIncome[dayIdx] += t.amountCents;
    }
  }

  const sortDesc = (map: Map<string, number>): NamedAmount[] =>
    [...map.entries()].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);

  const byDay: MonthDayData[] = Array.from({ length: daysInMonth }, (_, i) => ({
    date: new Date(Date.UTC(year, month - 1, i + 1)).toISOString().slice(0, 10),
    dayNum: i + 1,
    spentCents: byDaySpent[i],
    incomeCents: byDayIncome[i],
    txnCount: byDayCount[i],
    topCategory: byDayCat[i],
  }));

  const topTxns = txns
    .filter((t) => t.amountCents < 0 && !isTransferCat(t.category))
    .slice(0, 8)
    .map((t) => ({
      payee: t.payee,
      amountCents: t.amountCents,
      category: t.category?.name ?? "Uncategorized",
      date: t.date.toISOString().slice(0, 10),
    }));

  return {
    monthKey,
    spentCents,
    incomeCents,
    surplusCents: incomeCents - spentCents,
    txnCount: txns.filter((t) => !isTransferCat(t.category)).length,
    byCategory: sortDesc(byCategoryMap),
    byPayee: sortDesc(byPayeeMap).slice(0, 12),
    byDay,
    topTxns,
  };
}

export function buildMonthNarrative(current: MonthReviewData, previous: MonthReviewData): string {
  const currSpent = current.spentCents;
  const prevSpent = previous.spentCents;

  if (currSpent === 0 && prevSpent === 0) {
    return current.incomeCents > 0
      ? `Income of ${formatMoney(current.incomeCents)} with no spending recorded.`
      : "No transactions recorded this month yet.";
  }

  const lines: string[] = [];

  if (prevSpent > 0 && currSpent > 0) {
    const deltaPct = Math.round(((currSpent - prevSpent) / prevSpent) * 100);
    const [y, m] = previous.monthKey.split("-").map(Number);
    const prevLabel = new Date(Date.UTC(y, m - 1, 15)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });

    if (deltaPct <= -15) {
      lines.push(`Lighter month — spending down ${Math.abs(deltaPct)}% vs ${prevLabel}.`);
    } else if (deltaPct >= 15) {
      lines.push(`Heavier month — spending up ${deltaPct}% vs ${prevLabel}.`);
    } else {
      lines.push(`Spending is in line with ${prevLabel}.`);
    }

    // Find the biggest category change vs last month
    const prevCatMap = new Map(previous.byCategory.map((c) => [c.name, c.cents]));
    let biggestSpike = { name: "", delta: 0, pct: 0 };
    for (const cat of current.byCategory) {
      const prev = prevCatMap.get(cat.name) ?? 0;
      const delta = cat.cents - prev;
      if (prev > 0 && delta > 2000) {
        const pct = Math.round((delta / prev) * 100);
        if (pct > biggestSpike.pct) biggestSpike = { name: cat.name, delta, pct };
      } else if (prev === 0 && cat.cents > 5000) {
        if (cat.cents > biggestSpike.delta) biggestSpike = { name: cat.name, delta: cat.cents, pct: 100 };
      }
    }
    if (biggestSpike.pct >= 30) {
      lines.push(`${biggestSpike.name} drove the biggest jump — up ${formatMoney(biggestSpike.delta)}.`);
    }
  } else if (currSpent > 0) {
    lines.push(`${formatMoney(currSpent)} spent this month.`);
  }

  if (current.surplusCents > 0) {
    lines.push(`Net surplus of ${formatMoney(current.surplusCents)}.`);
  } else if (current.surplusCents < 0) {
    lines.push(`Spending exceeded income by ${formatMoney(Math.abs(current.surplusCents))}.`);
  }

  return lines.join(" ") || "Here's your month at a glance.";
}

/**
 * Compute a rolling average over the 3 full months before `currentMonthKey`.
 * Single DB query — no per-month round-trips.
 */
async function compute3MonthAverage(currentMonthKey: string): Promise<MonthAvg> {
  const MONTHS = 3;
  const [year, month] = currentMonthKey.split("-").map(Number);
  const windowStart = new Date(Date.UTC(year, month - 1 - MONTHS, 1));
  const windowEnd = new Date(Date.UTC(year, month - 1, 0, 23, 59, 59, 999)); // last ms before current month

  const txns = await prisma.transaction.findMany({
    where: { date: { gte: windowStart, lte: windowEnd } },
    include: { category: true },
  });

  const monthsWithData = new Set<string>();
  let totalSpent = 0;
  let totalIncome = 0;
  const byCategoryTotal = new Map<string, number>();

  for (const t of txns) {
    if (isTransferCat(t.category)) continue;
    monthsWithData.add(formatMonthKey(t.date));
    if (t.amountCents < 0) {
      const spent = Math.abs(t.amountCents);
      totalSpent += spent;
      const cat = t.category?.name ?? "Uncategorized";
      byCategoryTotal.set(cat, (byCategoryTotal.get(cat) ?? 0) + spent);
    } else if (t.amountCents > 0) {
      totalIncome += t.amountCents;
    }
  }

  const n = Math.max(monthsWithData.size, 1);
  const byCategory: NamedAmount[] = [...byCategoryTotal.entries()]
    .map(([name, cents]) => ({ name, cents: Math.round(cents / n) }))
    .sort((a, b) => b.cents - a.cents);

  return {
    monthsIncluded: n,
    spentCents: Math.round(totalSpent / n),
    incomeCents: Math.round(totalIncome / n),
    surplusCents: Math.round((totalIncome - totalSpent) / n),
    byCategory,
  };
}

export async function getMonthReviewSnapshot(monthKey: string): Promise<MonthReviewSnapshot> {
  const prevMonthKey = shiftMonthKey(monthKey, -1);

  const [current, previous, avg3] = await Promise.all([
    aggregateMonthForReview(monthKey),
    aggregateMonthForReview(prevMonthKey),
    compute3MonthAverage(monthKey),
  ]);

  return { current, previous, avg3, narrative: buildMonthNarrative(current, previous) };
}

// ---------------------------------------------------------------------------
// Tracker drill-down (click a visual → matching transactions)
// ---------------------------------------------------------------------------

export type TrackerTxnRow = {
  id: string;
  date: string;
  accountName: string;
  payee: string;
  categoryName: string;
  amountCents: number;
};

export type TrackerTxnQuery = {
  from: string; // YYYY-MM-DD
  to: string;
  kind?: "spend" | "income" | "all";
  category?: string;
  excludeCategories?: string[];
  excludePayees?: string[];
  account?: string;
  payee?: string;
};

const DRILLDOWN_LIMIT = 250;

export async function queryTrackerTransactions(q: TrackerTxnQuery): Promise<{
  rows: TrackerTxnRow[];
  totalCents: number;
  count: number;
  truncated: boolean;
}> {
  const start = new Date(`${q.from}T00:00:00.000Z`);
  const end = new Date(`${q.to}T23:59:59.999Z`);
  const kind = q.kind ?? "spend";

  const amountFilter =
    kind === "spend" ? { lt: 0 as const } : kind === "income" ? { gt: 0 as const } : undefined;

  const txns = await prisma.transaction.findMany({
    where: {
      date: { gte: start, lte: end },
      ...(amountFilter ? { amountCents: amountFilter } : {}),
      ...(q.account ? { account: { name: q.account } } : {}),
    },
    include: {
      category: { select: { name: true, isTransfer: true } },
      account: { select: { name: true } },
    },
    orderBy: [{ date: "desc" }, { amountCents: "asc" }],
  });

  const exclude = new Set((q.excludeCategories ?? []).map((n) => n.toUpperCase()));
  const excludePayees = new Set(q.excludePayees ?? []);
  const catFilter = q.category?.trim();
  const payeeFilter = q.payee?.trim();

  const matched = txns.filter((t) => {
    if (kind !== "all" && isTransferCat(t.category)) return false;

    const catName = t.category?.name ?? "Uncategorized";
    if (catFilter) {
      if (catFilter === "Uncategorized") {
        if (t.category && t.category.name !== "Uncategorized") return false;
      } else if (catName !== catFilter) {
        return false;
      }
    }
    if (exclude.size > 0 && exclude.has(catName.toUpperCase())) return false;
    if (payeeFilter && payeeGroupKey(t.payee) !== payeeFilter) return false;
    if (excludePayees.size > 0 && excludePayees.has(payeeGroupKey(t.payee))) return false;
    return true;
  });

  const totalCents = matched.reduce((s, t) => s + t.amountCents, 0);
  const truncated = matched.length > DRILLDOWN_LIMIT;
  const rows = matched.slice(0, DRILLDOWN_LIMIT).map((t) => ({
    id: t.id,
    date: t.date.toISOString().slice(0, 10),
    accountName: t.account.name,
    payee: t.payee,
    categoryName: t.category?.name ?? "Uncategorized",
    amountCents: t.amountCents,
  }));

  return { rows, totalCents, count: matched.length, truncated };
}
