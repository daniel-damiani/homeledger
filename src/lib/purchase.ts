import { prisma } from "./db";
import { classifyTrackerFlow } from "./tracker";

export type PurchaseKind = "HOUSE" | "CAR" | "CASH";

export type PurchaseLedgerSnapshot = {
  lookbackMonths: number;
  monthlyIncomeCents: number;
  monthlySpendCents: number;
  monthlyHousingCents: number;
  monthlySurplusCents: number;
  monthlySavingsGoalCents: number;
  saveCapacityCents: number;
  liquidCents: number;
  checkingCents: number;
  savingsCents: number;
  creditDebtCents: number;
  highInterestDebt: boolean;
};

export type PurchasePlanDTO = {
  kind: PurchaseKind;
  extraMonthlySaveCents: number;
  /** Null = not set; engine uses 0 until the user types a plan. */
  plannedMonthlySaveCents: number | null;
  extraIncomeCents: number;
  /** Null = trailing ledger income for the selected lookback. */
  incomeOverrideCents: number | null;
  otherDebtMonthlyCents: number;
  replaceHousing: boolean;
  emergencyMonths: number;
  lookbackMonths: number;
  otherCashCents: number;
  /** Null = DTI not computed. */
  grossAnnualIncomeCents: number | null;
  housePriceCents: number;
  downPct: number;
  mortgageRatePct: number;
  mortgageTermYears: number;
  propertyTaxPct: number;
  insuranceAnnualCents: number;
  hoaMonthlyCents: number;
  pmiAnnualPct: number;
  maintenancePct: number;
  closingCostPct: number;
  /** Null = closingCostPct of price. */
  closingCostOverrideCents: number | null;
  carPriceCents: number;
  carTaxPct: number;
  carFeesCents: number;
  carDownPct: number;
  carRatePct: number;
  carTermMonths: number;
  carInsuranceMonthlyCents: number;
  cashTargetCents: number;
  cashSavedOverrideCents: number | null;
};

export type PurchaseOverrides = Partial<PurchasePlanDTO>;

export type HouseResult = {
  priceCents: number;
  downCents: number;
  downPct: number;
  loanCents: number;
  piCents: number;
  taxCents: number;
  insuranceCents: number;
  hoaCents: number;
  pmiCents: number;
  maintenanceCents: number;
  pitiCents: number;
  allInCents: number;
  closingCents: number;
  cashToCloseCents: number;
  gapCents: number;
  monthsToSave: number | null;
  earliestDate: string | null;
  dtiFrontPct: number | null;
  dtiBackPct: number | null;
  leftoverCents: number;
  vsRentCents: number;
  rateShockPitiCents: number;
  priceShockCashToCloseCents: number;
  priceShockPitiCents: number;
};

export type CarResult = {
  priceCents: number;
  outTheDoorCents: number;
  downCents: number;
  loanCents: number;
  paymentCents: number;
  insuranceCents: number;
  monthlyAllInCents: number;
  gapCents: number;
  monthsToSave: number | null;
  earliestDate: string | null;
  leftoverCents: number;
};

export type CashResult = {
  targetCents: number;
  savedCents: number;
  gapCents: number;
  monthsToSave: number | null;
  earliestDate: string | null;
};

export type PurchaseResult = {
  kind: PurchaseKind;
  lookbackMonths: number;
  monthlyIncomeCents: number;
  monthlySpendCents: number;
  monthlyHousingCents: number;
  saveCapacityCents: number;
  extraMonthlySaveCents: number;
  savePerMonthCents: number;
  monthlySurplusCents: number;
  extraSaveHeadroomCents: number;
  extraSaveRealistic: boolean;
  liquidCents: number;
  usableLiquidCents: number;
  otherCashCents: number;
  availableCents: number;
  emergencyFloorCents: number;
  creditDebtCents: number;
  highInterestDebt: boolean;
  replaceHousing: boolean;
  grossAnnualIncomeCents: number | null;
  grossMonthlyIncomeCents: number | null;
  house: HouseResult | null;
  car: CarResult | null;
  cash: CashResult | null;
  dtiNote: string;
};

export type PurchaseAdviceTip = {
  id: string;
  severity: "info" | "warn" | "success";
  title: string;
  body: string;
};

const KINDS: PurchaseKind[] = ["HOUSE", "CAR", "CASH"];
export const LOOKBACK_MONTH_OPTIONS = [1, 3, 6, 12, 24] as const;
/** Housing (front-end) DTI rule of thumb. */
export const DTI_FRONT_LIMIT_PCT = 28;
/** Total (back-end) DTI conventional rule of thumb. */
export const DTI_BACK_LIMIT_PCT = 43;

export function isPurchaseKind(v: unknown): v is PurchaseKind {
  return typeof v === "string" && (KINDS as string[]).includes(v);
}

export function clampLookbackMonths(n: unknown, fallback = 12): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.round(Math.min(24, Math.max(1, v)));
}

function dollarsToCents(d: number): number {
  return Math.round(d * 100);
}

function centsToDollars(c: number): number {
  return Math.round(c) / 100;
}

/** Monthly payment for principal `p` (dollars) at annual % rate over `n` months. */
export function amortizeMonthly(principalDollars: number, annualRatePct: number, termMonths: number): number {
  if (principalDollars <= 0 || termMonths <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r <= 0) return principalDollars / termMonths;
  const pow = Math.pow(1 + r, termMonths);
  return (principalDollars * r * pow) / (pow - 1);
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthsAndDate(gapCents: number, savePerMonthCents: number): {
  monthsToSave: number | null;
  earliestDate: string | null;
} {
  if (gapCents <= 0) return { monthsToSave: 0, earliestDate: isoDate(new Date()) };
  if (savePerMonthCents <= 0) return { monthsToSave: null, earliestDate: null };
  const months = Math.ceil(gapCents / savePerMonthCents);
  return { monthsToSave: months, earliestDate: isoDate(addMonths(new Date(), months)) };
}

export async function getOrCreatePurchasePlan(): Promise<PurchasePlanDTO> {
  const row = await prisma.purchasePlan.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
  return {
    kind: row.kind as PurchaseKind,
    extraMonthlySaveCents: row.extraMonthlySaveCents,
    plannedMonthlySaveCents: row.plannedMonthlySaveCents,
    extraIncomeCents: row.extraIncomeCents,
    incomeOverrideCents: row.incomeOverrideCents,
    otherDebtMonthlyCents: row.otherDebtMonthlyCents,
    replaceHousing: row.replaceHousing,
    emergencyMonths: row.emergencyMonths,
    lookbackMonths: row.lookbackMonths,
    otherCashCents: row.otherCashCents,
    grossAnnualIncomeCents: row.grossAnnualIncomeCents,
    housePriceCents: row.housePriceCents,
    downPct: row.downPct,
    mortgageRatePct: row.mortgageRatePct,
    mortgageTermYears: row.mortgageTermYears,
    propertyTaxPct: row.propertyTaxPct,
    insuranceAnnualCents: row.insuranceAnnualCents,
    hoaMonthlyCents: row.hoaMonthlyCents,
    pmiAnnualPct: row.pmiAnnualPct,
    maintenancePct: row.maintenancePct,
    closingCostPct: row.closingCostPct,
    closingCostOverrideCents: row.closingCostOverrideCents,
    carPriceCents: row.carPriceCents,
    carTaxPct: row.carTaxPct,
    carFeesCents: row.carFeesCents,
    carDownPct: row.carDownPct,
    carRatePct: row.carRatePct,
    carTermMonths: row.carTermMonths,
    carInsuranceMonthlyCents: row.carInsuranceMonthlyCents,
    cashTargetCents: row.cashTargetCents,
    cashSavedOverrideCents: row.cashSavedOverrideCents,
  };
}

export async function loadPurchaseLedger(lookbackMonths = 12): Promise<PurchaseLedgerSnapshot> {
  const months = clampLookbackMonths(lookbackMonths);
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  from.setUTCMonth(from.getUTCMonth() - months);

  const [accounts, settings, txns] = await Promise.all([
    prisma.account.findMany({
      where: { archived: false },
      select: { type: true, balanceCents: true },
    }),
    prisma.appSettings.findUnique({ where: { id: 1 } }),
    prisma.transaction.findMany({
      where: { date: { gte: from, lte: now } },
      include: { category: true },
    }),
  ]);

  const checkingCents = accounts
    .filter((a) => a.type === "CHECKING" || a.type === "CASH")
    .reduce((s, a) => s + Math.max(0, a.balanceCents), 0);
  const savingsCents = accounts
    .filter((a) => a.type === "SAVINGS")
    .reduce((s, a) => s + Math.max(0, a.balanceCents), 0);
  const creditDebtCents = accounts
    .filter((a) => a.type === "CREDIT")
    .reduce((s, a) => s + Math.abs(a.balanceCents), 0);

  let spend = 0;
  let income = 0;
  let housing = 0;
  for (const t of txns) {
    const flow = classifyTrackerFlow(t.amountCents, t.category);
    if (flow === "skip") continue;
    const isRent =
      t.category?.name === "Rent / Mortgage" ||
      (t.category?.group === "Housing" && t.category.name !== "Utilities");
    if (flow === "income") income += t.amountCents;
    else if (flow === "spend") {
      const amt = Math.abs(t.amountCents);
      spend += amt;
      if (isRent) housing += amt;
    } else {
      spend -= t.amountCents;
      if (isRent) housing -= t.amountCents;
    }
  }
  spend = Math.max(0, spend);
  housing = Math.max(0, housing);
  const monthlyIncomeCents = Math.round(income / months);
  const monthlySpendCents = Math.round(spend / months);
  const monthlyHousingCents = Math.round(housing / months);
  const monthlySurplusCents = monthlyIncomeCents - monthlySpendCents;
  const monthlySavingsGoalCents = settings?.monthlySavingsGoalCents ?? 0;
  const saveCapacityCents = Math.max(monthlySurplusCents, monthlySavingsGoalCents, 0);

  return {
    lookbackMonths: months,
    monthlyIncomeCents,
    monthlySpendCents,
    monthlyHousingCents,
    monthlySurplusCents,
    monthlySavingsGoalCents,
    saveCapacityCents,
    liquidCents: checkingCents + savingsCents,
    checkingCents,
    savingsCents,
    creditDebtCents,
    highInterestDebt: creditDebtCents > 10_000,
  };
}

function mergePlan(profile: PurchasePlanDTO, overrides?: PurchaseOverrides): PurchasePlanDTO {
  return { ...profile, ...overrides };
}

function houseStack(
  priceCents: number,
  downPct: number,
  ratePct: number,
  termYears: number,
  p: PurchasePlanDTO
): Omit<HouseResult, "gapCents" | "monthsToSave" | "earliestDate" | "leftoverCents" | "vsRentCents" | "dtiFrontPct" | "dtiBackPct"> {
  const down = Math.round((priceCents * downPct) / 100);
  const loan = Math.max(0, priceCents - down);
  const pi = dollarsToCents(amortizeMonthly(loan / 100, ratePct, termYears * 12));
  const tax = Math.round((priceCents * p.propertyTaxPct) / 100 / 12);
  const insurance = Math.round(p.insuranceAnnualCents / 12);
  const hoa = p.hoaMonthlyCents;
  const pmi = downPct < 20 ? Math.round((loan * p.pmiAnnualPct) / 100 / 12) : 0;
  const maintenance = Math.round((priceCents * p.maintenancePct) / 100 / 12);
  const piti = pi + tax + insurance + hoa + pmi;
  const allIn = piti + maintenance;
  const closing =
    p.closingCostOverrideCents != null
      ? p.closingCostOverrideCents
      : Math.round((priceCents * p.closingCostPct) / 100);
  const cashToClose = down + closing;
  return {
    priceCents,
    downCents: down,
    downPct,
    loanCents: loan,
    piCents: pi,
    taxCents: tax,
    insuranceCents: insurance,
    hoaCents: hoa,
    pmiCents: pmi,
    maintenanceCents: maintenance,
    pitiCents: piti,
    allInCents: allIn,
    closingCents: closing,
    cashToCloseCents: cashToClose,
    rateShockPitiCents: 0,
    priceShockCashToCloseCents: 0,
    priceShockPitiCents: 0,
  };
}

export function runPurchaseEngine(
  snap: PurchaseLedgerSnapshot,
  profile: PurchasePlanDTO,
  overrides?: PurchaseOverrides
): PurchaseResult {
  const p = mergePlan(profile, overrides);
  const baseIncome = p.incomeOverrideCents ?? snap.monthlyIncomeCents;
  const income = baseIncome + p.extraIncomeCents;
  const emergencyFloor = Math.round(snap.monthlySpendCents * p.emergencyMonths);
  const usableLiquid = Math.max(0, snap.liquidCents - emergencyFloor);
  const otherCash = Math.max(0, p.otherCashCents);
  const availableCents = usableLiquid + otherCash;
  const housingBoost = p.replaceHousing ? snap.monthlyHousingCents : 0;
  const monthlySurplusCents = income - snap.monthlySpendCents;
  const saveCapacityCents = Math.max(monthlySurplusCents, snap.monthlySavingsGoalCents, 0);
  const savePerMonth = Math.max(0, p.plannedMonthlySaveCents ?? 0);
  const extraSaveHeadroomCents = monthlySurplusCents - savePerMonth;
  const extraSaveRealistic = savePerMonth <= 0 || savePerMonth <= monthlySurplusCents;

  let house: HouseResult | null = null;
  let car: CarResult | null = null;
  let cash: CashResult | null = null;

  if (p.kind === "HOUSE") {
    const h = houseStack(p.housePriceCents, p.downPct, p.mortgageRatePct, p.mortgageTermYears, p);
    const gap = Math.max(0, h.cashToCloseCents - availableCents);
    const { monthsToSave, earliestDate } = monthsAndDate(gap, savePerMonth);
    const shockRate = houseStack(
      p.housePriceCents,
      p.downPct,
      p.mortgageRatePct + 1,
      p.mortgageTermYears,
      p
    );
    const shockPrice = houseStack(
      Math.round(p.housePriceCents * 1.1),
      p.downPct,
      p.mortgageRatePct,
      p.mortgageTermYears,
      p
    );
    const leftover =
      income - snap.monthlySpendCents + housingBoost - h.allInCents;
    const grossMonthly =
      p.grossAnnualIncomeCents != null && p.grossAnnualIncomeCents > 0
        ? Math.round(p.grossAnnualIncomeCents / 12)
        : null;
    house = {
      ...h,
      gapCents: gap,
      monthsToSave,
      earliestDate,
      dtiFrontPct:
        grossMonthly != null && grossMonthly > 0
          ? Math.round((h.pitiCents / grossMonthly) * 1000) / 10
          : null,
      dtiBackPct:
        grossMonthly != null && grossMonthly > 0
          ? Math.round(((h.pitiCents + p.otherDebtMonthlyCents) / grossMonthly) * 1000) / 10
          : null,
      leftoverCents: leftover,
      vsRentCents: h.allInCents - snap.monthlyHousingCents,
      rateShockPitiCents: shockRate.pitiCents,
      priceShockCashToCloseCents: shockPrice.cashToCloseCents,
      priceShockPitiCents: shockPrice.pitiCents,
    };
  } else if (p.kind === "CAR") {
    const tax = Math.round((p.carPriceCents * p.carTaxPct) / 100);
    const outTheDoor = p.carPriceCents + tax + p.carFeesCents;
    const down = Math.round((p.carPriceCents * p.carDownPct) / 100);
    const loan = Math.max(0, outTheDoor - down);
    const payment = dollarsToCents(amortizeMonthly(loan / 100, p.carRatePct, p.carTermMonths));
    const monthlyAllIn = payment + p.carInsuranceMonthlyCents;
    const gap = Math.max(0, down - availableCents);
    const { monthsToSave, earliestDate } = monthsAndDate(gap, savePerMonth);
    const leftover = income - snap.monthlySpendCents - monthlyAllIn;
    car = {
      priceCents: p.carPriceCents,
      outTheDoorCents: outTheDoor,
      downCents: down,
      loanCents: loan,
      paymentCents: payment,
      insuranceCents: p.carInsuranceMonthlyCents,
      monthlyAllInCents: monthlyAllIn,
      gapCents: gap,
      monthsToSave,
      earliestDate,
      leftoverCents: leftover,
    };
  } else {
    const saved =
      (p.cashSavedOverrideCents != null ? p.cashSavedOverrideCents : usableLiquid) + otherCash;
    const gap = Math.max(0, p.cashTargetCents - saved);
    const { monthsToSave, earliestDate } = monthsAndDate(gap, savePerMonth);
    cash = {
      targetCents: p.cashTargetCents,
      savedCents: saved,
      gapCents: gap,
      monthsToSave,
      earliestDate,
    };
  }

  return {
    kind: p.kind,
    lookbackMonths: snap.lookbackMonths,
    monthlyIncomeCents: income,
    monthlySpendCents: snap.monthlySpendCents,
    monthlyHousingCents: snap.monthlyHousingCents,
    saveCapacityCents,
    extraMonthlySaveCents: savePerMonth,
    savePerMonthCents: savePerMonth,
    monthlySurplusCents,
    extraSaveHeadroomCents,
    extraSaveRealistic,
    liquidCents: snap.liquidCents,
    usableLiquidCents: usableLiquid,
    otherCashCents: otherCash,
    availableCents,
    emergencyFloorCents: emergencyFloor,
    creditDebtCents: snap.creditDebtCents,
    highInterestDebt: snap.highInterestDebt,
    replaceHousing: p.replaceHousing,
    grossAnnualIncomeCents: p.grossAnnualIncomeCents,
    grossMonthlyIncomeCents:
      p.grossAnnualIncomeCents != null && p.grossAnnualIncomeCents > 0
        ? Math.round(p.grossAnnualIncomeCents / 12)
        : null,
    house,
    car,
    cash,
    dtiNote:
      "DTI uses gross monthly income (annual ÷ 12), not take-home. Front-end is PITI ÷ gross; back-end is PITI plus other debts you enter. 28% housing / 43% total are conventional rules of thumb, not underwriting.",
  };
}

export async function computePurchasePlan(overrides?: PurchaseOverrides): Promise<{
  snapshot: PurchaseLedgerSnapshot;
  profile: PurchasePlanDTO;
  result: PurchaseResult;
}> {
  const profile = await getOrCreatePurchasePlan();
  const snapshot = await loadPurchaseLedger(overrides?.lookbackMonths ?? profile.lookbackMonths);
  const result = runPurchaseEngine(snapshot, profile, overrides);
  return { snapshot, profile, result };
}

export function compactPurchaseAdvice(result: PurchaseResult) {
  const d = centsToDollars;
  const base = {
    kind: result.kind,
    lookbackMonths: result.lookbackMonths,
    monthlyIncome: d(result.monthlyIncomeCents),
    monthlySpend: d(result.monthlySpendCents),
    monthlyHousing: d(result.monthlyHousingCents),
    saveCapacity: d(result.saveCapacityCents),
    extraMonthlySave: d(result.extraMonthlySaveCents),
    savePerMonth: d(result.savePerMonthCents),
    monthlySurplus: d(result.monthlySurplusCents),
    extraSaveHeadroom: d(result.extraSaveHeadroomCents),
    extraSaveRealistic: result.extraSaveRealistic,
    liquid: d(result.liquidCents),
    usableLiquid: d(result.usableLiquidCents),
    otherCash: d(result.otherCashCents),
    available: d(result.availableCents),
    emergencyFloor: d(result.emergencyFloorCents),
    highInterestDebt: result.highInterestDebt,
    creditDebt: d(result.creditDebtCents),
    replaceHousing: result.replaceHousing,
    grossAnnualIncome: result.grossAnnualIncomeCents != null ? d(result.grossAnnualIncomeCents) : null,
    grossMonthlyIncome: result.grossMonthlyIncomeCents != null ? d(result.grossMonthlyIncomeCents) : null,
  };
  if (result.house) {
    const h = result.house;
    return {
      ...base,
      price: d(h.priceCents),
      down: d(h.downCents),
      loan: d(h.loanCents),
      piti: d(h.pitiCents),
      allIn: d(h.allInCents),
      cashToClose: d(h.cashToCloseCents),
      gap: d(h.gapCents),
      monthsToSave: h.monthsToSave,
      earliestDate: h.earliestDate,
      dtiFrontPct: h.dtiFrontPct,
      dtiBackPct: h.dtiBackPct,
      leftover: d(h.leftoverCents),
      vsRent: d(h.vsRentCents),
      rateShockPiti: d(h.rateShockPitiCents),
      priceShockCashToClose: d(h.priceShockCashToCloseCents),
    };
  }
  if (result.car) {
    const c = result.car;
    return {
      ...base,
      price: d(c.priceCents),
      outTheDoor: d(c.outTheDoorCents),
      down: d(c.downCents),
      payment: d(c.paymentCents),
      monthlyAllIn: d(c.monthlyAllInCents),
      gap: d(c.gapCents),
      monthsToSave: c.monthsToSave,
      earliestDate: c.earliestDate,
      leftover: d(c.leftoverCents),
    };
  }
  if (result.cash) {
    return {
      ...base,
      target: d(result.cash.targetCents),
      saved: d(result.cash.savedCents),
      gap: d(result.cash.gapCents),
      monthsToSave: result.cash.monthsToSave,
      earliestDate: result.cash.earliestDate,
    };
  }
  return base;
}

export function buildPurchaseTips(result: PurchaseResult): PurchaseAdviceTip[] {
  const money = (cents: number) =>
    `$${(Math.round(cents) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const tips: PurchaseAdviceTip[] = [];

  if (result.highInterestDebt) {
    tips.push({
      id: "pay-cards",
      severity: "warn",
      title: "Pay credit cards first",
      body: `${money(result.creditDebtCents)} on cards usually beats stretching a down payment. High-interest balances first.`,
    });
  }

  if (result.savePerMonthCents > 0 && !result.extraSaveRealistic) {
    tips.push({
      id: "extra-save",
      severity: "warn",
      title: "Planned save is above usual surplus",
      body: `Surplus over the last ${result.lookbackMonths} month${result.lookbackMonths === 1 ? "" : "s"} is ${money(result.monthlySurplusCents)}/mo. Planning to save ${money(result.savePerMonthCents)} would require cutting spend or raising income.`,
    });
  }

  if (result.emergencyFloorCents > 0 && result.liquidCents < result.emergencyFloorCents) {
    tips.push({
      id: "efund",
      severity: "warn",
      title: "Thin cash buffer",
      body: `Liquid cash ${money(result.liquidCents)} is below the ${result.emergencyFloorCents === 0 ? "" : `${money(result.emergencyFloorCents)} `}emergency floor (kept out of “usable” down-payment cash).`,
    });
  }

  if (result.house) {
    const h = result.house;
    if (result.grossMonthlyIncomeCents == null) {
      tips.push({
        id: "dti-gross",
        severity: "info",
        title: "Enter gross annual income for DTI",
        body: "Lenders use pre-tax household income. Take-home from the ledger is used for leftover, not DTI. Months to close use the monthly save you typed.",
      });
    }
    if (h.dtiFrontPct != null && h.dtiFrontPct > DTI_FRONT_LIMIT_PCT) {
      tips.push({
        id: "dti-front",
        severity: "warn",
        title: `Housing DTI ${h.dtiFrontPct}% (${DTI_FRONT_LIMIT_PCT}% rule of thumb)`,
        body: `PITI ${money(h.pitiCents)} vs gross ${money(result.grossMonthlyIncomeCents ?? 0)}/mo. Lower the price, raise the down payment, or wait — this is not underwriting.`,
      });
    }
    if (h.dtiBackPct != null && h.dtiBackPct > DTI_BACK_LIMIT_PCT) {
      tips.push({
        id: "dti-back",
        severity: "warn",
        title: `Total DTI ${h.dtiBackPct}% (${DTI_BACK_LIMIT_PCT}% conventional rule of thumb)`,
        body: "PITI plus other debts you entered (car, student loans, card minimums, support) is high relative to gross income. Some programs allow up to 50% with compensating factors.",
      });
    }
    if (h.gapCents > 0) {
      tips.push({
        id: "gap",
        severity: h.monthsToSave != null && h.monthsToSave <= 24 ? "info" : "warn",
        title: `${money(h.gapCents)} still needed to close`,
        body:
          h.monthsToSave != null
            ? `At ${money(result.savePerMonthCents)}/mo, about ${h.monthsToSave} months (${h.earliestDate}).`
            : "Planned monthly save is $0 — enter how much you will put toward this each month.",
      });
    } else {
      tips.push({
        id: "ready",
        severity: "success",
        title: "Cash to close is covered",
        body: `Usable liquid ${money(result.usableLiquidCents)} covers ${money(h.cashToCloseCents)} (after the emergency floor).`,
      });
    }
    if (h.leftoverCents < 0) {
      tips.push({
        id: "tight",
        severity: "warn",
        title: "Monthly budget would go negative",
        body: `All-in housing ${money(h.allInCents)} vs leftover after current spend. Cut the price or keep more of today’s housing cost in the budget.`,
      });
    }
  }

  if (result.car) {
    const c = result.car;
    if (c.gapCents > 0) {
      tips.push({
        id: "car-gap",
        severity: "info",
        title: `${money(c.gapCents)} more for the down payment`,
        body:
          c.monthsToSave != null
            ? `About ${c.monthsToSave} months at ${money(result.savePerMonthCents)}/mo.`
            : "Monthly save capacity is $0.",
      });
    }
    if (c.leftoverCents < 0) {
      tips.push({
        id: "car-tight",
        severity: "warn",
        title: "Payment plus insurance exceeds leftover",
        body: `All-in ${money(c.monthlyAllInCents)}/mo does not fit today’s surplus.`,
      });
    }
  }

  if (result.cash) {
    const c = result.cash;
    if (c.gapCents <= 0) {
      tips.push({
        id: "cash-ready",
        severity: "success",
        title: "Target is already funded",
        body: `Saved ${money(c.savedCents)} vs ${money(c.targetCents)}.`,
      });
    } else {
      tips.push({
        id: "cash-gap",
        severity: "info",
        title: `${money(c.gapCents)} to go`,
        body:
          c.monthsToSave != null
            ? `Earliest around ${c.earliestDate} at ${money(result.savePerMonthCents)}/mo.`
            : "Need a positive monthly save rate to set a date.",
      });
    }
  }

  return tips.slice(0, 6);
}
