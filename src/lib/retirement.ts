import { prisma } from "./db";
import { classifyTrackerFlow } from "./tracker";

export type TaxBucketKind = "TRADITIONAL" | "ROTH" | "TAXABLE" | "UNKNOWN";

export type RetirementAccountRow = {
  id: string;
  name: string;
  type: string;
  balanceCents: number;
  taxBucket: TaxBucketKind;
  inferredBucket: TaxBucketKind;
  effectiveBucket: TaxBucketKind;
};

export type LedgerSnapshot = {
  investmentCents: number;
  savingsCents: number;
  checkingCents: number;
  creditDebtCents: number;
  trailingSpendCents: number;
  trailingSurplusCents: number;
  investmentInflowCents: number;
  monthlySavingsGoalCents: number;
  annualSavingCents: number;
  emergencyMonths: number | null;
  accounts: RetirementAccountRow[];
  currentYear: number;
};

export type RetirementProfileDTO = {
  birthYear: number | null;
  retireAge: number;
  longevityAge: number;
  ssFraMonthlyCents: number;
  ssClaimAge: number;
  desiredAnnualSpendCents: number | null;
  stockPct: number;
  glidePath: boolean;
  includeSavings: boolean;
  extraMonthlySaveCents: number;
  stockReturnPct: number;
  bondReturnPct: number;
  inflationPct: number;
  traditionalTaxHaircutPct: number;
};

export type RetirementOverrides = Partial<{
  birthYear: number;
  retireAge: number;
  extraMonthlySaveCents: number;
  annualSpendCents: number;
  ssClaimAge: number;
  stockPct: number;
  glidePath: boolean;
  includeSavings: boolean;
}>;

export type PathPoint = {
  age: number;
  p10: number;
  p50: number;
  p90: number;
  deterministic: number;
};

export type AgeCompareRow = {
  retireAge: number;
  successPct: number;
  nestEggAtRetireCents: number;
};

export type RetirementResult = {
  currentAge: number;
  retireAge: number;
  longevityAge: number;
  nestEggNowCents: number;
  annualSpendCents: number;
  annualSavingCents: number;
  extraMonthlySaveCents: number;
  ssAnnualAtClaimCents: number;
  ssClaimAge: number;
  successPct: number;
  nestEggAtRetireCents: number;
  impliedSafeSpendCents: number;
  extraMonthlyTo90Cents: number;
  earliestRetireAge: number | null;
  coastSuccessPct: number;
  fourPctSpendCents: number;
  path: PathPoint[];
  ageCompare: AgeCompareRow[];
  catchUpEligible: boolean;
  catchUpNote: string | null;
  highInterestDebt: boolean;
  creditDebtCents: number;
  emergencyMonths: number | null;
  traditionalShare: number;
  nSims: number;
  ssScaleNote: string;
};

export type RetirementAdviceTip = {
  id: string;
  severity: "info" | "warn" | "success";
  title: string;
  body: string;
};

const N_SIMS_MAIN = 800;
const N_SIMS_SEARCH = 250;
const STOCK_VOL = 0.15;
const BOND_VOL = 0.05;
const RETURN_CORR = 0.2;
const GLIDE_FLOOR = 0.4;

/** 2026 IRS catch-up (not fetched from an API). */
const CATCHUP_401K_CENTS = 750_000;
const CATCHUP_401K_SUPER_CENTS = 1_125_000;
const CATCHUP_IRA_CENTS = 100_000;

const BUCKETS: TaxBucketKind[] = ["TRADITIONAL", "ROTH", "TAXABLE", "UNKNOWN"];

export function inferTaxBucket(name: string): TaxBucketKind {
  const n = name.toLowerCase();
  if (/\broth\b/.test(n)) return "ROTH";
  if (/\b(401k|401\(k\)|403b|403\(b\)|457|tsp|traditional|pension)\b/.test(n) || /401/.test(n) || /403/.test(n)) {
    return "TRADITIONAL";
  }
  if (/\b(brokerage|taxable|individual|brokerage account)\b/.test(n)) return "TAXABLE";
  return "UNKNOWN";
}

export function effectiveTaxBucket(
  stored: TaxBucketKind,
  name: string
): TaxBucketKind {
  if (stored !== "UNKNOWN") return stored;
  const inferred = inferTaxBucket(name);
  return inferred === "UNKNOWN" ? "TRADITIONAL" : inferred;
}

/** Rule-of-thumb FRA (67) scaling: ~30% cut at 62, ~24% boost at 70. */
export function ssMultiplier(claimAge: number): number {
  const age = Math.min(70, Math.max(62, claimAge));
  if (age <= 67) return 0.7 + ((age - 62) * 0.3) / 5;
  return 1 + (age - 67) * 0.08;
}

function realReturn(nominalPct: number, inflationPct: number): number {
  const inf = 1 + inflationPct / 100;
  if (inf <= 0) return nominalPct / 100;
  return (1 + nominalPct / 100) / inf - 1;
}

function stockWeight(
  age: number,
  currentAge: number,
  retireAge: number,
  startPct: number,
  glide: boolean
): number {
  const start = Math.min(1, Math.max(0, startPct / 100));
  if (!glide) return start;
  if (age >= retireAge) return GLIDE_FLOOR;
  const span = Math.max(1, retireAge - currentAge);
  const t = Math.min(1, Math.max(0, (age - currentAge) / span));
  return start + (GLIDE_FLOOR - start) * t;
}

/** Gross portfolio withdrawal to fund after-tax spend `need`, given traditional share. */
export function withdrawalGross(need: number, tradShare: number, haircut: number): number {
  if (need <= 0) return 0;
  const t = Math.min(1, Math.max(0, tradShare));
  const h = Math.min(0.5, Math.max(0, haircut));
  if (h <= 0 || t <= 0) return need;
  const denom = 1 - h;
  if (denom <= 0.01) return need * 4;
  return need * (1 - t + t / denom);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function hashSeed(parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h ^= Math.floor(Math.abs(p) * 1000) >>> 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
}

type SimCfg = {
  currentAge: number;
  retireAge: number;
  longevityAge: number;
  nestEgg: number;
  annualContrib: number;
  annualSpend: number;
  ssAnnual: number;
  ssClaimAge: number;
  stockPct: number;
  glidePath: boolean;
  stockMu: number;
  bondMu: number;
  haircut: number;
  tradShare: number;
};

function runOnePath(
  cfg: SimCfg,
  rng: (() => number) | null,
  capture: number[] | null
): { ok: boolean; nestAtRetire: number } {
  let nest = cfg.nestEgg;
  let nestAtRetire = nest;
  const lastAge = cfg.longevityAge;
  for (let age = cfg.currentAge; age < lastAge; age++) {
    if (age === cfg.retireAge) nestAtRetire = nest;
    if (age >= cfg.retireAge) {
      const ss = age >= cfg.ssClaimAge ? cfg.ssAnnual : 0;
      const need = Math.max(0, cfg.annualSpend - ss);
      nest -= withdrawalGross(need, cfg.tradShare, cfg.haircut);
      if (nest <= 0) {
        nest = 0;
        if (capture) {
          while (capture.length < lastAge - cfg.currentAge) capture.push(0);
        }
        return { ok: false, nestAtRetire: age === cfg.retireAge ? 0 : nestAtRetire };
      }
    } else {
      nest += cfg.annualContrib;
    }
    const w = stockWeight(age, cfg.currentAge, cfg.retireAge, cfg.stockPct, cfg.glidePath);
    let ret: number;
    if (!rng) {
      ret = w * cfg.stockMu + (1 - w) * cfg.bondMu;
    } else {
      const z1 = gauss(rng);
      const z2 = gauss(rng);
      const stockR = cfg.stockMu + STOCK_VOL * z1;
      const bondR = cfg.bondMu + BOND_VOL * (RETURN_CORR * z1 + Math.sqrt(1 - RETURN_CORR * RETURN_CORR) * z2);
      ret = w * stockR + (1 - w) * bondR;
    }
    nest *= 1 + ret;
    if (nest < 0) nest = 0;
    capture?.push(nest);
  }
  if (cfg.retireAge >= lastAge) nestAtRetire = nest;
  return { ok: nest > 0, nestAtRetire };
}

function successPct(cfg: SimCfg, nSims: number, seed: number): number {
  const rng = mulberry32(seed);
  let ok = 0;
  for (let i = 0; i < nSims; i++) {
    if (runOnePath(cfg, rng, null).ok) ok++;
  }
  return Math.round((ok / nSims) * 1000) / 10;
}

function dollarsToCents(d: number): number {
  return Math.round(d * 100);
}

function catchUpNote(currentAge: number): string | null {
  if (currentAge < 50) return null;
  if (currentAge >= 60 && currentAge <= 63) {
    return `Ages 60–63 can use the higher 401(k) catch-up of $${(CATCHUP_401K_SUPER_CENTS / 100).toLocaleString()} plus $${(CATCHUP_IRA_CENTS / 100).toLocaleString()} IRA catch-up (2026 IRS limits).`;
  }
  return `Age 50+ catch-up: extra $${(CATCHUP_401K_CENTS / 100).toLocaleString()} to a 401(k) and $${(CATCHUP_IRA_CENTS / 100).toLocaleString()} to an IRA (2026 IRS limits).`;
}

export async function getOrCreateRetirementProfile(): Promise<RetirementProfileDTO> {
  const row = await prisma.retirementProfile.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
  return {
    birthYear: row.birthYear,
    retireAge: row.retireAge,
    longevityAge: row.longevityAge,
    ssFraMonthlyCents: row.ssFraMonthlyCents,
    ssClaimAge: row.ssClaimAge,
    desiredAnnualSpendCents: row.desiredAnnualSpendCents,
    stockPct: row.stockPct,
    glidePath: row.glidePath,
    includeSavings: row.includeSavings,
    extraMonthlySaveCents: row.extraMonthlySaveCents,
    stockReturnPct: row.stockReturnPct,
    bondReturnPct: row.bondReturnPct,
    inflationPct: row.inflationPct,
    traditionalTaxHaircutPct: row.traditionalTaxHaircutPct,
  };
}

export async function loadLedgerSnapshot(): Promise<LedgerSnapshot> {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
  const currentYear = now.getUTCFullYear();

  const [accounts, settings, txns, investmentTxns] = await Promise.all([
    prisma.account.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        balanceCents: true,
        taxBucket: true,
      },
    }),
    prisma.appSettings.findUnique({ where: { id: 1 } }),
    prisma.transaction.findMany({
      where: { date: { gte: from, lte: now } },
      include: { category: true },
    }),
    prisma.transaction.findMany({
      where: {
        date: { gte: from, lte: now },
        account: { type: "INVESTMENT" },
      },
      select: { amountCents: true },
    }),
  ]);

  const rows: RetirementAccountRow[] = accounts.map((a) => {
    const stored = a.taxBucket as TaxBucketKind;
    const inferred = inferTaxBucket(a.name);
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      balanceCents: a.balanceCents,
      taxBucket: stored,
      inferredBucket: inferred,
      effectiveBucket: effectiveTaxBucket(stored, a.name),
    };
  });

  const investmentCents = rows
    .filter((a) => a.type === "INVESTMENT")
    .reduce((s, a) => s + Math.max(0, a.balanceCents), 0);
  const savingsCents = rows
    .filter((a) => a.type === "SAVINGS")
    .reduce((s, a) => s + Math.max(0, a.balanceCents), 0);
  const checkingCents = rows
    .filter((a) => a.type === "CHECKING" || a.type === "CASH")
    .reduce((s, a) => s + Math.max(0, a.balanceCents), 0);
  const creditDebtCents = rows
    .filter((a) => a.type === "CREDIT")
    .reduce((s, a) => s + Math.abs(a.balanceCents), 0);

  let spend = 0;
  let income = 0;
  for (const t of txns) {
    const flow = classifyTrackerFlow(t.amountCents, t.category);
    if (flow === "skip") continue;
    if (flow === "income") income += t.amountCents;
    else if (flow === "spend") spend += Math.abs(t.amountCents);
    else spend -= t.amountCents;
  }
  spend = Math.max(0, spend);
  const trailingSurplusCents = income - spend;
  const investmentInflowCents = investmentTxns.reduce((s, t) => s + t.amountCents, 0);
  const monthlySavingsGoalCents = settings?.monthlySavingsGoalCents ?? 0;
  const annualSavingCents = Math.max(
    investmentInflowCents,
    monthlySavingsGoalCents * 12,
    Math.max(0, trailingSurplusCents)
  );
  const monthlySpend = spend / 12;
  const cashBuffer = checkingCents + savingsCents;
  const emergencyMonths =
    monthlySpend > 0 ? Math.round((cashBuffer / monthlySpend) * 10) / 10 : null;

  return {
    investmentCents,
    savingsCents,
    checkingCents,
    creditDebtCents,
    trailingSpendCents: spend,
    trailingSurplusCents,
    investmentInflowCents,
    monthlySavingsGoalCents,
    annualSavingCents,
    emergencyMonths,
    accounts: rows.filter((a) => a.type === "INVESTMENT" || a.type === "SAVINGS"),
    currentYear,
  };
}

function nestEggNow(snap: LedgerSnapshot, includeSavings: boolean): number {
  return snap.investmentCents + (includeSavings ? snap.savingsCents : 0);
}

function traditionalShare(snap: LedgerSnapshot, includeSavings: boolean): number {
  const pool = snap.accounts.filter(
    (a) => a.type === "INVESTMENT" || (includeSavings && a.type === "SAVINGS")
  );
  const total = pool.reduce((s, a) => s + Math.max(0, a.balanceCents), 0);
  if (total <= 0) return 1;
  const trad = pool
    .filter((a) => a.effectiveBucket === "TRADITIONAL")
    .reduce((s, a) => s + Math.max(0, a.balanceCents), 0);
  return trad / total;
}

function buildCfg(
  snap: LedgerSnapshot,
  profile: RetirementProfileDTO,
  overrides: RetirementOverrides | undefined,
  currentAge: number
): SimCfg {
  const includeSavings = overrides?.includeSavings ?? profile.includeSavings;
  const retireAge = overrides?.retireAge ?? profile.retireAge;
  const extra = overrides?.extraMonthlySaveCents ?? profile.extraMonthlySaveCents;
  const spend =
    overrides?.annualSpendCents ??
    profile.desiredAnnualSpendCents ??
    snap.trailingSpendCents;
  const ssClaimAge = overrides?.ssClaimAge ?? profile.ssClaimAge;
  const stockPct = overrides?.stockPct ?? profile.stockPct;
  const glidePath = overrides?.glidePath ?? profile.glidePath;
  const ssAnnual =
    (profile.ssFraMonthlyCents / 100) * 12 * ssMultiplier(ssClaimAge);
  const nest = nestEggNow(snap, includeSavings) / 100;
  const contrib = (snap.annualSavingCents + extra * 12) / 100;
  return {
    currentAge,
    retireAge: Math.min(profile.longevityAge - 1, Math.max(currentAge, retireAge)),
    longevityAge: Math.max(retireAge + 1, profile.longevityAge),
    nestEgg: Math.max(0, nest),
    annualContrib: Math.max(0, contrib),
    annualSpend: Math.max(0, spend / 100),
    ssAnnual: Math.max(0, ssAnnual),
    ssClaimAge: Math.min(70, Math.max(62, ssClaimAge)),
    stockPct,
    glidePath,
    stockMu: realReturn(profile.stockReturnPct, profile.inflationPct),
    bondMu: realReturn(profile.bondReturnPct, profile.inflationPct),
    haircut: profile.traditionalTaxHaircutPct / 100,
    tradShare: traditionalShare(snap, includeSavings),
  };
}

function binarySearchMin(
  low: number,
  high: number,
  steps: number,
  test: (x: number) => boolean
): number {
  let lo = low;
  let hi = high;
  let best = high;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (test(mid)) {
      best = mid;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return best;
}

function binarySearchMax(
  low: number,
  high: number,
  steps: number,
  test: (x: number) => boolean
): number {
  let lo = low;
  let hi = high;
  let best = low;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (test(mid)) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

export function runRetirementEngine(
  snap: LedgerSnapshot,
  profile: RetirementProfileDTO,
  overrides?: RetirementOverrides
): RetirementResult {
  if (profile.birthYear == null && overrides?.birthYear == null) {
    throw new Error("birthYear required");
  }
  const birthYear = overrides?.birthYear ?? profile.birthYear;
  if (birthYear == null) {
    throw new Error("birthYear required");
  }
  const currentAge = snap.currentYear - birthYear;
  if (currentAge < 18 || currentAge > 90) {
    throw new Error("Birth year implies an age outside 18–90");
  }
  const cfg = buildCfg(snap, profile, overrides, currentAge);
  const seed = hashSeed([
    cfg.retireAge,
    cfg.annualSpend,
    cfg.annualContrib,
    cfg.ssClaimAge,
    cfg.nestEgg,
    cfg.stockPct,
  ]);

  const detPath: number[] = [];
  const det = runOnePath(cfg, null, detPath);
  const nestAtRetire = det.nestAtRetire;

  const nSims = N_SIMS_MAIN;
  const rng = mulberry32(seed);
  const byAge: number[][] = Array.from({ length: cfg.longevityAge - cfg.currentAge }, () => []);
  let ok = 0;
  for (let i = 0; i < nSims; i++) {
    const capture: number[] = [];
    const r = runOnePath(cfg, rng, capture);
    if (r.ok) ok++;
    for (let y = 0; y < byAge.length; y++) {
      byAge[y].push(capture[y] ?? 0);
    }
  }
  const success = Math.round((ok / nSims) * 1000) / 10;

  const path: PathPoint[] = byAge.map((vals, i) => {
    const sorted = [...vals].sort((a, b) => a - b);
    return {
      age: cfg.currentAge + i + 1,
      p10: dollarsToCents(percentile(sorted, 10)),
      p50: dollarsToCents(percentile(sorted, 50)),
      p90: dollarsToCents(percentile(sorted, 90)),
      deterministic: dollarsToCents(detPath[i] ?? 0),
    };
  });

  const searchSeed = seed ^ 0x9e3779b9;
  const spendHi = Math.max(cfg.annualSpend * 2, nestAtRetire * 0.08, 1);
  const impliedSafeSpend = binarySearchMax(0, spendHi, 12, (spend) => {
    const c = { ...cfg, annualSpend: spend };
    return successPct(c, N_SIMS_SEARCH, searchSeed) >= 90;
  });

  let extraMonthlyTo90 = 0;
  if (success < 90) {
    const extraAnnual = binarySearchMin(0, 250_000, 12, (add) => {
      const c = { ...cfg, annualContrib: cfg.annualContrib + add };
      return successPct(c, N_SIMS_SEARCH, searchSeed ^ 1) >= 90;
    });
    extraMonthlyTo90 = extraAnnual / 12;
  }

  const coastCfg = { ...cfg, annualContrib: 0 };
  const coastSuccessPct = successPct(coastCfg, N_SIMS_SEARCH, searchSeed ^ 2);

  let earliest: number | null = null;
  const minAge = Math.min(cfg.longevityAge - 5, currentAge + 1);
  const maxAge = Math.min(cfg.longevityAge - 5, Math.max(cfg.retireAge + 8, 70));
  for (let age = minAge; age <= maxAge; age++) {
    const c = {
      ...cfg,
      retireAge: age,
      longevityAge: Math.max(age + 1, cfg.longevityAge),
    };
    if (successPct(c, N_SIMS_SEARCH, searchSeed ^ 3) >= 90) {
      earliest = age;
      break;
    }
  }

  const compareAges = [62, 65, 67].filter(
    (a) => a > currentAge && a < cfg.longevityAge - 1
  );
  const ageCompare: AgeCompareRow[] = compareAges.map((age) => {
    const c = { ...cfg, retireAge: age, longevityAge: Math.max(age + 1, cfg.longevityAge) };
    const nest = runOnePath(c, null, null).nestAtRetire;
    return {
      retireAge: age,
      successPct: successPct(c, N_SIMS_SEARCH, searchSeed ^ age),
      nestEggAtRetireCents: dollarsToCents(nest),
    };
  });

  const includeSavings = overrides?.includeSavings ?? profile.includeSavings;
  const extraMonthly = overrides?.extraMonthlySaveCents ?? profile.extraMonthlySaveCents;

  return {
    currentAge,
    retireAge: cfg.retireAge,
    longevityAge: cfg.longevityAge,
    nestEggNowCents: nestEggNow(snap, includeSavings),
    annualSpendCents: dollarsToCents(cfg.annualSpend),
    annualSavingCents: snap.annualSavingCents + extraMonthly * 12,
    extraMonthlySaveCents: extraMonthly,
    ssAnnualAtClaimCents: dollarsToCents(cfg.ssAnnual),
    ssClaimAge: cfg.ssClaimAge,
    successPct: success,
    nestEggAtRetireCents: dollarsToCents(nestAtRetire),
    impliedSafeSpendCents: dollarsToCents(impliedSafeSpend),
    extraMonthlyTo90Cents: dollarsToCents(extraMonthlyTo90),
    earliestRetireAge: earliest,
    coastSuccessPct,
    fourPctSpendCents: dollarsToCents(nestAtRetire * 0.04),
    path,
    ageCompare,
    catchUpEligible: currentAge >= 50,
    catchUpNote: catchUpNote(currentAge),
    highInterestDebt: snap.creditDebtCents > 10_000,
    creditDebtCents: snap.creditDebtCents,
    emergencyMonths: snap.emergencyMonths,
    traditionalShare: Math.round(cfg.tradShare * 1000) / 1000,
    nSims,
    ssScaleNote:
      "Social Security at 62 / 67 / 70 is scaled from the FRA amount with a rule of thumb (~30% cut at 62, ~24% boost at 70), not an SSA quote.",
  };
}

export async function computeRetirementPlan(
  overrides?: RetirementOverrides
): Promise<{
  snapshot: LedgerSnapshot;
  profile: RetirementProfileDTO;
  result: RetirementResult | null;
  error?: string;
}> {
  const [snapshot, profile] = await Promise.all([
    loadLedgerSnapshot(),
    getOrCreateRetirementProfile(),
  ]);
  if (profile.birthYear == null && overrides?.birthYear == null) {
    return { snapshot, profile, result: null, error: "Set a birth year to run the plan." };
  }
  try {
    const result = runRetirementEngine(snapshot, profile, overrides);
    return { snapshot, profile, result };
  } catch (e) {
    return {
      snapshot,
      profile,
      result: null,
      error: e instanceof Error ? e.message : "Compute failed",
    };
  }
}

export function compactAdvicePayload(result: RetirementResult) {
  const d = (cents: number) => Math.round(cents) / 100;
  return {
    currentAge: result.currentAge,
    retireAge: result.retireAge,
    longevityAge: result.longevityAge,
    successPct: result.successPct,
    nestEggNow: d(result.nestEggNowCents),
    nestEggAtRetire: d(result.nestEggAtRetireCents),
    annualSpend: d(result.annualSpendCents),
    annualSaving: d(result.annualSavingCents),
    extraMonthlySave: d(result.extraMonthlySaveCents),
    extraMonthlyTo90: d(result.extraMonthlyTo90Cents),
    impliedSafeSpend: d(result.impliedSafeSpendCents),
    fourPctSpend: d(result.fourPctSpendCents),
    ssAnnual: d(result.ssAnnualAtClaimCents),
    ssClaimAge: result.ssClaimAge,
    earliestRetireAge: result.earliestRetireAge,
    coastSuccessPct: result.coastSuccessPct,
    highInterestDebt: result.highInterestDebt,
    creditDebt: d(result.creditDebtCents),
    emergencyMonths: result.emergencyMonths,
    catchUpEligible: result.catchUpEligible,
    catchUpNote: result.catchUpNote,
    traditionalShare: result.traditionalShare,
    ageCompare: result.ageCompare.map((r) => ({
      retireAge: r.retireAge,
      successPct: r.successPct,
      nestEggAtRetire: d(r.nestEggAtRetireCents),
    })),
    nSims: result.nSims,
  };
}

export function buildRetirementTips(result: RetirementResult): RetirementAdviceTip[] {
  const tips: RetirementAdviceTip[] = [];
  const money = (cents: number) =>
    `$${(Math.round(cents) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  if (result.highInterestDebt) {
    tips.push({
      id: "pay-cards",
      severity: "warn",
      title: "Pay credit cards first",
      body: `${money(result.creditDebtCents)} on cards usually beats extra investing. Clear high-interest balances before raising the savings rate.`,
    });
  }

  if (result.successPct >= 90) {
    tips.push({
      id: "on-track",
      severity: "success",
      title: "On track at this retirement age",
      body: `${result.successPct}% of simulated markets last to age ${result.longevityAge}. Coast-FIRE (stop contributing now) is ${result.coastSuccessPct}%.`,
    });
  } else {
    const bits: string[] = [];
    if (result.extraMonthlyTo90Cents > 0) {
      bits.push(`about ${money(result.extraMonthlyTo90Cents)}/mo more saving`);
    }
    if (result.earliestRetireAge != null && result.earliestRetireAge > result.retireAge) {
      bits.push(`or wait until age ${result.earliestRetireAge}`);
    }
    bits.push("spend less in retirement");
    if (result.ssClaimAge < 70 && result.ssAnnualAtClaimCents > 0) {
      bits.push("delay Social Security toward 70");
    }
    tips.push({
      id: "below-90",
      severity: "warn",
      title: `${result.successPct}% success — below the 90% bar`,
      body: `Highest leverage: ${bits.join("; ")}.`,
    });
  }

  if (result.ssClaimAge === 62 && result.ssAnnualAtClaimCents > 0) {
    tips.push({
      id: "ss-early",
      severity: "info",
      title: "Claiming Social Security at 62",
      body: "The engine applies the usual ~30% cut vs full retirement age. Delaying to 67 or 70 is often the cheaper way to raise success than saving a lot more.",
    });
  } else if (result.ssClaimAge < 70 && result.successPct < 90 && result.ssAnnualAtClaimCents > 0) {
    tips.push({
      id: "ss-delay",
      severity: "info",
      title: "Social Security claiming age",
      body: `You’re modeled at ${result.ssClaimAge}. Waiting toward 70 boosts the FRA amount ~8%/year after 67 (rule of thumb).`,
    });
  }

  if (result.emergencyMonths != null && result.emergencyMonths < 3) {
    tips.push({
      id: "efund",
      severity: "warn",
      title: "Thin cash buffer",
      body: `${result.emergencyMonths} months of checking+savings vs recent spend. Build an emergency fund before stretching retirement contributions.`,
    });
  }

  if (result.catchUpNote) {
    tips.push({
      id: "catch-up",
      severity: "info",
      title: "Catch-up contributions",
      body: result.catchUpNote,
    });
  }

  const four = result.fourPctSpendCents;
  const swr = result.impliedSafeSpendCents;
  if (four > 0 && swr > 0) {
    tips.push({
      id: "swr-vs-4",
      severity: "info",
      title: "4% rule vs this simulation",
      body: `4% of the nest egg at retirement is ${money(four)}/year. The 90% Monte Carlo spend is ${money(swr)}/year (today’s dollars).`,
    });
  }

  return tips.slice(0, 6);
}

export function isTaxBucket(v: unknown): v is TaxBucketKind {
  return typeof v === "string" && (BUCKETS as string[]).includes(v);
}
