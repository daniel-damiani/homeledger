import { prisma } from "./db";
import { payeeGroupKey } from "./tracker";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IncomeFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly" | "irregular";

export type DetectedIncome = {
  payee: string;
  frequency: IncomeFrequency;
  /** Median amount in cents */
  medianAmountCents: number;
  /** ISO date of the projected next occurrence */
  nextDate: string;
  /** Confidence 0–1 based on regularity */
  confidence: number;
};

export type IncomeEntry = {
  payee: string;
  frequency: IncomeFrequency;
  amountCents: number;
  nextDate: string; // "YYYY-MM-DD" — user-confirmed next payday
};

export type ForecastDay = {
  date: string;       // "YYYY-MM-DD"
  balanceCents: number;
  incomeEvents: { payee: string; amountCents: number }[];
  billEvents: { name: string; amountCents: number }[];
  /** Estimated daily spend deducted today */
  dailySpendCents: number;
};

export type ForecastResult = {
  accountId: string;
  accountName: string;
  startingBalanceCents: number;
  /** Estimated variable daily spend rate (total outflows minus recurring bills, ÷ 90 days) */
  dailySpendRateCents: number;
  /** Number of recurring bills auto-detected or manually configured */
  billsDetected: number;
  days: ForecastDay[];
  /** Lowest balance day in the forecast window */
  minBalanceCents: number;
  minBalanceDate: string;
  /** true if balance ever falls below lowThresholdCents */
  dipsBelow: boolean;
  lowThresholdCents: number;
  /** Suggested transfer from savings (cents), 0 if not needed */
  suggestedTransferCents: number;
  suggestedTransferBy: string | null; // ISO date of first dip
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function classifyFrequency(intervalDays: number[]): IncomeFrequency {
  if (intervalDays.length === 0) return "irregular";
  const med = median(intervalDays);
  if (med >= 6 && med <= 8) return "weekly";
  if (med >= 12 && med <= 16) return "biweekly";
  if (med >= 14 && med <= 16) return "biweekly"; // overlap handled by order
  if (med >= 25 && med <= 35) return "monthly";
  // Semi-monthly: look for two clusters around ~15 days
  if (med >= 13 && med <= 17) {
    const low = intervalDays.filter((d) => d <= 16).length;
    const high = intervalDays.filter((d) => d > 16).length;
    if (low > 0 && high > 0) return "semimonthly";
  }
  return "irregular";
}

/**
 * Project the next occurrence of a given income entry from today.
 * Returns the next ISO date string.
 */
export function nextOccurrence(entry: IncomeEntry, fromDate: Date = new Date()): Date {
  const anchor = new Date(`${entry.nextDate}T12:00:00Z`);
  let candidate = new Date(anchor);
  const today = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate(), 12));

  const stepDays: Record<IncomeFrequency, number> = {
    weekly: 7,
    biweekly: 14,
    semimonthly: 15, // approximate
    monthly: 30,     // handled specially below
    irregular: 30,
  };

  if (entry.frequency === "monthly") {
    // Use same day-of-month as nextDate
    const dom = anchor.getUTCDate();
    candidate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), dom, 12));
    if (candidate < today) {
      candidate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, dom, 12));
    }
    return candidate;
  }

  const step = stepDays[entry.frequency];
  // Advance anchor until it's >= today
  while (candidate < today) {
    candidate = addDays(candidate, step);
  }
  return candidate;
}

/**
 * Enumerate all payday dates for a given entry within the forecast window.
 */
function paydays(entry: IncomeEntry, fromDate: Date, horizonDays: number): Date[] {
  const today = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate(), 12));
  const endDate = addDays(today, horizonDays);

  const stepDays: Record<IncomeFrequency, number> = {
    weekly: 7,
    biweekly: 14,
    semimonthly: 15,
    monthly: 0, // handled specially
    irregular: 0,
  };

  const dates: Date[] = [];
  let cur = nextOccurrence(entry, fromDate);

  if (entry.frequency === "monthly") {
    const dom = new Date(`${entry.nextDate}T12:00:00Z`).getUTCDate();
    let y = today.getUTCFullYear();
    let mo = today.getUTCMonth();
    // Start from the month where nextOccurrence falls
    const first = cur;
    dates.push(first);
    for (let i = 1; i < 12; i++) {
      mo += 1;
      if (mo > 11) { mo = 0; y += 1; }
      const d = new Date(Date.UTC(y, mo, dom, 12));
      if (d > endDate) break;
      dates.push(d);
    }
    return dates;
  }

  const step = stepDays[entry.frequency];
  if (step === 0) {
    // irregular — just one occurrence
    if (cur <= endDate) dates.push(cur);
    return dates;
  }

  while (cur <= endDate) {
    dates.push(new Date(cur));
    cur = addDays(cur, step);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Income pattern detection
// ---------------------------------------------------------------------------

/**
 * Detect recurring income patterns from the last `lookbackDays` days of
 * transactions for the given account.
 */
export async function detectIncomePattern(
  accountId: string,
  lookbackDays = 120
): Promise<DetectedIncome[]> {
  const since = addDays(new Date(), -lookbackDays);
  since.setUTCHours(0, 0, 0, 0);

  const txns = await prisma.transaction.findMany({
    where: {
      accountId,
      amountCents: { gt: 0 },
      date: { gte: since },
    },
    include: { category: true },
    orderBy: { date: "asc" },
  });

  // Exclude transfers
  const incomeTxns = txns.filter((t) => !t.category?.isTransfer);

  // Group by payee key
  const groups = new Map<string, { dates: Date[]; amounts: number[] }>();
  for (const t of incomeTxns) {
    const key = payeeGroupKey(t.payee);
    if (!groups.has(key)) groups.set(key, { dates: [], amounts: [] });
    groups.get(key)!.dates.push(t.date);
    groups.get(key)!.amounts.push(t.amountCents);
  }

  const results: DetectedIncome[] = [];

  for (const [payee, { dates, amounts }] of groups) {
    if (dates.length < 2) continue;

    // Sort dates ascending
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());

    // Compute intervals between consecutive dates
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const diffMs = sorted[i].getTime() - sorted[i - 1].getTime();
      intervals.push(Math.round(diffMs / 86_400_000));
    }

    const freq = classifyFrequency(intervals);
    const medAmt = median(amounts);

    // Confidence: 1 - (stddev of intervals / mean interval), clamped 0-1
    const meanInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length || 1;
    const variance = intervals.reduce((s, v) => s + (v - meanInterval) ** 2, 0) / intervals.length;
    const stddev = Math.sqrt(variance);
    const confidence = Math.max(0, Math.min(1, 1 - stddev / meanInterval));

    // Project next date from the last occurrence
    const lastDate = sorted[sorted.length - 1];
    let nextMs: number;
    if (freq === "monthly") {
      const dom = lastDate.getUTCDate();
      const now = new Date();
      let d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dom, 12));
      if (d <= new Date()) d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, dom, 12));
      nextMs = d.getTime();
    } else {
      const stepMap: Record<IncomeFrequency, number> = {
        weekly: 7,
        biweekly: 14,
        semimonthly: 15,
        monthly: 30,
        irregular: meanInterval,
      };
      const step = stepMap[freq] * 86_400_000;
      let candidate = new Date(lastDate.getTime() + step);
      const now = new Date();
      while (candidate < now) {
        candidate = new Date(candidate.getTime() + step);
      }
      nextMs = candidate.getTime();
    }

    results.push({
      payee,
      frequency: freq,
      medianAmountCents: medAmt,
      nextDate: isoDate(new Date(nextMs)),
      confidence,
    });
  }

  // Sort by total income (highest first)
  const totals = new Map<string, number>();
  for (const t of incomeTxns) {
    const key = payeeGroupKey(t.payee);
    totals.set(key, (totals.get(key) ?? 0) + t.amountCents);
  }
  results.sort((a, b) => (totals.get(b.payee) ?? 0) - (totals.get(a.payee) ?? 0));

  return results.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Internal: detect recurring outflows from a checking account
// ---------------------------------------------------------------------------

type DetectedBill = {
  name: string;
  dayOfMonth: number;    // most common day-of-month this bill posts
  amountCents: number;   // median absolute amount
};

async function detectRecurringBills(
  accountId: string,
  lookbackDays = 90
): Promise<DetectedBill[]> {
  const since = addDays(new Date(), -lookbackDays);
  since.setUTCHours(0, 0, 0, 0);

  const txns = await prisma.transaction.findMany({
    where: { accountId, amountCents: { lt: 0 }, date: { gte: since } },
    orderBy: { date: "asc" },
  });

  // Group by payee key
  const groups = new Map<string, { dates: Date[]; amounts: number[] }>();
  for (const t of txns) {
    const key = payeeGroupKey(t.payee);
    if (!groups.has(key)) groups.set(key, { dates: [], amounts: [] });
    groups.get(key)!.dates.push(t.date);
    groups.get(key)!.amounts.push(Math.abs(t.amountCents));
  }

  const bills: DetectedBill[] = [];

  for (const [name, { dates, amounts }] of groups) {
    if (dates.length < 2) continue;

    // Compute intervals between consecutive dates
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(Math.round((sorted[i].getTime() - sorted[i - 1].getTime()) / 86_400_000));
    }

    const med = median(intervals);
    // Only keep roughly-monthly patterns (14-45 day intervals) — skip daily noise
    if (med < 14 || med > 45) continue;

    // Most common day-of-month from historical occurrences
    const domCounts = new Map<number, number>();
    for (const d of sorted) {
      const dom = d.getUTCDate();
      domCounts.set(dom, (domCounts.get(dom) ?? 0) + 1);
    }
    const dayOfMonth = [...domCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

    bills.push({ name, dayOfMonth, amountCents: median(amounts) });
  }

  return bills;
}

// ---------------------------------------------------------------------------
// Forecast computation
// ---------------------------------------------------------------------------

/**
 * Compute a day-by-day balance forecast for the given account.
 */
export async function computeForecast(
  accountId: string,
  incomeSchedule: IncomeEntry[],
  horizonDays = 60,
  lowThresholdCents = 50_000 // $500
): Promise<ForecastResult> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { name: true, balanceCents: true, availableBalanceCents: true },
  });

  // Use availableBalance if set (more conservative / accurate for checking)
  const startingBalance = account.availableBalanceCents ?? account.balanceCents;

  // Pending transactions: settle them on day 1
  const pending = await prisma.transaction.findMany({
    where: { accountId, pending: true },
    select: { amountCents: true },
  });
  const pendingNet = pending.reduce((s, t) => s + t.amountCents, 0);

  const ninetyDaysAgo = addDays(new Date(), -90);
  ninetyDaysAgo.setUTCHours(0, 0, 0, 0);

  // Fetch ALL outflows (including transfers/credit-card payments — they all reduce the balance)
  const allOutflows = await prisma.transaction.findMany({
    where: { accountId, amountCents: { lt: 0 }, date: { gte: ninetyDaysAgo } },
    select: { amountCents: true },
  });
  const totalOutflowCents = allOutflows.reduce((s, t) => s + Math.abs(t.amountCents), 0);

  // Auto-detect recurring bills (credit card payments, mortgage, etc.)
  // AND merge with any manually-configured RecurringPayment entries
  const [detectedBills, recurringManual] = await Promise.all([
    detectRecurringBills(accountId, 90),
    prisma.recurringPayment.findMany({
      where: { fromAccountId: accountId, active: true },
      select: { name: true, payee: true, amountCents: true, dayOfMonth: true },
    }),
  ]);

  // Merge: manual entries override auto-detected ones with same day-of-month
  const manualDoms = new Set(recurringManual.map((r) => r.dayOfMonth));
  const mergedBills: DetectedBill[] = [
    ...recurringManual.map((r) => ({
      name: r.name || r.payee,
      dayOfMonth: r.dayOfMonth,
      amountCents: Math.abs(r.amountCents),
    })),
    ...detectedBills.filter((b) => !manualDoms.has(b.dayOfMonth)),
  ];

  // Daily rate = total outflows minus the 90-day contribution of recurring bills,
  // capturing irregular / variable spending (groceries, gas, etc.)
  const recurringMonthlyTotal = mergedBills.reduce((s, b) => s + b.amountCents, 0);
  const recurringIn90Days = recurringMonthlyTotal * 3; // ~3 months = 90 days
  const variableOutflows = Math.max(0, totalOutflowCents - recurringIn90Days);
  const dailySpendRateCents = Math.round(variableOutflows / 90);

  // Build payday lookup: date string → list of income events
  const incomeByDate = new Map<string, { payee: string; amountCents: number }[]>();
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 12));

  for (const entry of incomeSchedule) {
    for (const d of paydays(entry, todayUtc, horizonDays)) {
      const key = isoDate(d);
      if (!incomeByDate.has(key)) incomeByDate.set(key, []);
      incomeByDate.get(key)!.push({ payee: entry.payee, amountCents: entry.amountCents });
    }
  }

  // Build recurring bill lookup: dayOfMonth → list of bills
  const billByDom = new Map<number, { name: string; amountCents: number }[]>();
  for (const b of mergedBills) {
    if (!billByDom.has(b.dayOfMonth)) billByDom.set(b.dayOfMonth, []);
    billByDom.get(b.dayOfMonth)!.push({ name: b.name, amountCents: b.amountCents });
  }

  // Day-by-day projection
  const days: ForecastDay[] = [];
  let balance = startingBalance;

  for (let i = 0; i < horizonDays; i++) {
    const d = addDays(todayUtc, i);
    const dateStr = isoDate(d);
    const dom = d.getUTCDate();

    const incomeEvents = incomeByDate.get(dateStr) ?? [];
    const billEvents = billByDom.get(dom) ?? [];

    let dayNet = 0;

    // Settle pending on day 0
    if (i === 0 && pendingNet !== 0) dayNet += pendingNet;

    // Income
    for (const ev of incomeEvents) dayNet += ev.amountCents;

    // Bills
    for (const ev of billEvents) dayNet -= ev.amountCents;

    // Daily baseline spend always applied — income and bills are on top of it
    dayNet -= dailySpendRateCents;

    balance += dayNet;

    days.push({
      date: dateStr,
      balanceCents: balance,
      incomeEvents,
      billEvents,
      dailySpendCents: dailySpendRateCents,
    });
  }

  // Find min balance
  let minBalance = startingBalance;
  let minBalanceDate = isoDate(todayUtc);
  for (const d of days) {
    if (d.balanceCents < minBalance) {
      minBalance = d.balanceCents;
      minBalanceDate = d.date;
    }
  }

  // Transfer suggestion
  const firstDip = days.find((d) => d.balanceCents < lowThresholdCents);
  const suggestedTransferCents =
    minBalance < lowThresholdCents
      ? Math.max(lowThresholdCents - minBalance, 0)
      : 0;

  return {
    accountId,
    accountName: account.name,
    startingBalanceCents: startingBalance,
    dailySpendRateCents,
    billsDetected: mergedBills.length,
    days,
    minBalanceCents: minBalance,
    minBalanceDate,
    dipsBelow: minBalance < lowThresholdCents,
    lowThresholdCents,
    suggestedTransferCents,
    suggestedTransferBy: firstDip?.date ?? null,
  };
}

