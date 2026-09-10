"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";
import { BuyAdvice } from "./BuyAdvice";
import {
  LOOKBACK_MONTH_OPTIONS,
  type PurchaseAdviceTip,
  type PurchaseKind,
  type PurchaseLedgerSnapshot,
  type PurchasePlanDTO,
  type PurchaseResult,
} from "@/lib/purchase";

function dollars(cents: number): string {
  return (cents / 100).toFixed(0);
}

function parseDollars(raw: string): number {
  const n = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function lookbackPhrase(n: number): string {
  return n === 1 ? "last month" : `last ${n} months`;
}

function FieldHint({ text }: { text: string }) {
  return (
    <span className="field-hint">
      <button
        type="button"
        className="field-hint-icon"
        aria-label={text}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        ⓘ
      </button>
      <span className="field-hint-tip" role="tooltip">
        {text}
      </span>
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <span className="stat muted stat-label">
        {label}
        {hint ? <FieldHint text={hint} /> : null}
      </span>
      <span className="stat">{value}</span>
    </div>
  );
}

function HowCalculated({ result }: { result: PurchaseResult }) {
  const save = formatMoney(result.savePerMonthCents);
  const usable = formatMoney(result.usableLiquidCents);
  const floor = formatMoney(result.emergencyFloorCents);
  const liquid = formatMoney(result.liquidCents);
  const other = formatMoney(result.otherCashCents);
  const available = formatMoney(result.availableCents);

  if (result.house) {
    const h = result.house;
    const months =
      h.monthsToSave == null
        ? "cannot be dated until monthly save is positive"
        : h.monthsToSave === 0
          ? "already covered"
          : `${h.monthsToSave} months at ${save}/mo`;
    return (
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>How this is calculated</h2>
        <p style={{ marginTop: 0 }}>
          Loan is price minus down ({formatMoney(h.priceCents)} − {formatMoney(h.downCents)} ={" "}
          {formatMoney(h.loanCents)}). Principal and interest is a fixed amortization at your rate
          and term. PITI is P&amp;I + tax + insurance + HOA + PMI (PMI only if down is under 20%).
          All-in adds a maintenance reserve. Cash to close is down + closing costs (
          {formatMoney(h.downCents)} + {formatMoney(h.closingCents)} = {formatMoney(h.cashToCloseCents)}
          ). Closing is either a percent of price or a dollar amount you type.
        </p>
        <p>
          Checking + savings ({liquid}) minus a {floor} emergency floor leaves {usable} usable.
          Other cash not in the ledger ({other}) is added on top — sale proceeds, a gift, etc. —
          for {available} available. Cash still needed (gap) is cash to close minus available (
          {formatMoney(h.cashToCloseCents)} − {available} = {formatMoney(h.gapCents)}). Months to save
          use only the monthly amount you typed ({save}/mo), not inferred surplus. Time to save:{" "}
          {months}. Housing DTI is PITI ÷ gross monthly income (your annual figure ÷ 12);
          total DTI adds other debts you enter. Leftover still uses take-home, not gross.
        </p>
      </section>
    );
  }
  if (result.car) {
    const c = result.car;
    const months =
      c.monthsToSave == null
        ? "cannot be dated until monthly save is positive"
        : c.monthsToSave === 0
          ? "already covered"
          : `${c.monthsToSave} months at ${save}/mo`;
    return (
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>How this is calculated</h2>
        <p style={{ marginTop: 0 }}>
          Out the door is price + tax + fees ({formatMoney(c.outTheDoorCents)}). Loan is that minus
          down ({formatMoney(c.loanCents)}). The payment is a fixed amortization; monthly all-in adds
          insurance ({formatMoney(c.monthlyAllInCents)}).
        </p>
        <p>
          Usable cash is liquid {liquid} minus a {floor} emergency floor ({usable}), plus other cash
          not in the ledger ({other}) = {available} available. Gap vs down payment is{" "}
          {formatMoney(c.gapCents)}. Months use the amount you typed ({save}/mo). Time to save:{" "}
          {months}.
        </p>
      </section>
    );
  }
  if (result.cash) {
    const c = result.cash;
    const months =
      c.monthsToSave == null
        ? "cannot be dated until monthly save is positive"
        : c.monthsToSave === 0
          ? "already funded"
          : `${c.monthsToSave} months at ${save}/mo`;
    return (
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>How this is calculated</h2>
        <p style={{ marginTop: 0 }}>
          Gap is target minus counted savings ({formatMoney(c.targetCents)} − {formatMoney(c.savedCents)}{" "}
          = {formatMoney(c.gapCents)}). Counted savings is usable liquid (checking + savings minus the{" "}
          {floor} emergency floor) plus other cash not in the ledger ({other}), unless you typed an
          “already saved” override (other cash is still added). Months use the amount you typed (
          {save}/mo). Time to save: {months}.
        </p>
      </section>
    );
  }
  return null;
}

export function BuyView() {
  const [snapshot, setSnapshot] = useState<PurchaseLedgerSnapshot | null>(null);
  const [profile, setProfile] = useState<PurchasePlanDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [kind, setKind] = useState<PurchaseKind>("HOUSE");
  const [plannedSave, setPlannedSave] = useState("0");
  const [income, setIncome] = useState("0");
  const [useLedgerIncome, setUseLedgerIncome] = useState(true);
  const [otherDebt, setOtherDebt] = useState("0");
  const [replaceHousing, setReplaceHousing] = useState(true);
  const [emergencyMonths, setEmergencyMonths] = useState("3");
  const [lookbackMonths, setLookbackMonths] = useState(12);
  const [otherCash, setOtherCash] = useState("0");
  const [grossAnnual, setGrossAnnual] = useState("");

  const [housePrice, setHousePrice] = useState("400000");
  const [downPct, setDownPct] = useState(20);
  const [rate, setRate] = useState("6.5");
  const [termYears, setTermYears] = useState(30);
  const [taxPct, setTaxPct] = useState("1");
  const [insuranceAnnual, setInsuranceAnnual] = useState("1500");
  const [hoa, setHoa] = useState("0");
  const [pmiPct, setPmiPct] = useState("0.5");
  const [maintPct, setMaintPct] = useState("1");
  const [closingPct, setClosingPct] = useState("3");
  const [closingDollars, setClosingDollars] = useState("");
  const [useClosingPct, setUseClosingPct] = useState(true);

  const [carPrice, setCarPrice] = useState("30000");
  const [carTaxPct, setCarTaxPct] = useState("6");
  const [carFees, setCarFees] = useState("500");
  const [carDownPct, setCarDownPct] = useState(10);
  const [carRate, setCarRate] = useState("7");
  const [carTerm, setCarTerm] = useState(60);
  const [carIns, setCarIns] = useState("150");

  const [cashTarget, setCashTarget] = useState("10000");
  const [cashSaved, setCashSaved] = useState("");
  const [useLiquidForCash, setUseLiquidForCash] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [computing, setComputing] = useState(false);
  const [tips, setTips] = useState<PurchaseAdviceTip[]>([]);

  const computeTimer = useRef<number | null>(null);

  const applyProfile = useCallback((p: PurchasePlanDTO, snap: PurchaseLedgerSnapshot) => {
    setProfile(p);
    setKind(p.kind);
    setPlannedSave(dollars(p.plannedMonthlySaveCents ?? snap.saveCapacityCents));
    const folded =
      p.incomeOverrideCents ??
      (p.extraIncomeCents > 0 ? snap.monthlyIncomeCents + p.extraIncomeCents : null);
    setUseLedgerIncome(folded == null);
    setIncome(dollars(folded ?? snap.monthlyIncomeCents));
    setOtherDebt(dollars(p.otherDebtMonthlyCents));
    setReplaceHousing(p.replaceHousing);
    setEmergencyMonths(String(p.emergencyMonths));
    setLookbackMonths(p.lookbackMonths);
    setOtherCash(dollars(p.otherCashCents));
    setGrossAnnual(p.grossAnnualIncomeCents != null ? dollars(p.grossAnnualIncomeCents) : "");
    setHousePrice(dollars(p.housePriceCents));
    setDownPct(p.downPct);
    setRate(String(p.mortgageRatePct));
    setTermYears(p.mortgageTermYears);
    setTaxPct(String(p.propertyTaxPct));
    setInsuranceAnnual(dollars(p.insuranceAnnualCents));
    setHoa(dollars(p.hoaMonthlyCents));
    setPmiPct(String(p.pmiAnnualPct));
    setMaintPct(String(p.maintenancePct));
    setClosingPct(String(p.closingCostPct));
    setUseClosingPct(p.closingCostOverrideCents == null);
    setClosingDollars(
      p.closingCostOverrideCents != null
        ? dollars(p.closingCostOverrideCents)
        : dollars(Math.round((p.housePriceCents * p.closingCostPct) / 100))
    );
    setCarPrice(dollars(p.carPriceCents));
    setCarTaxPct(String(p.carTaxPct));
    setCarFees(dollars(p.carFeesCents));
    setCarDownPct(p.carDownPct);
    setCarRate(String(p.carRatePct));
    setCarTerm(p.carTermMonths);
    setCarIns(dollars(p.carInsuranceMonthlyCents));
    setCashTarget(dollars(p.cashTargetCents));
    setUseLiquidForCash(p.cashSavedOverrideCents == null);
    setCashSaved(p.cashSavedOverrideCents != null ? dollars(p.cashSavedOverrideCents) : "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/buy/snapshot");
        if (!res.ok) throw new Error(res.status === 401 ? "Unlock first" : "Failed to load");
        const data = (await res.json()) as {
          snapshot: PurchaseLedgerSnapshot;
          profile: PurchasePlanDTO;
        };
        if (cancelled) return;
        setSnapshot(data.snapshot);
        applyProfile(data.profile, data.snapshot);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyProfile]);

  const overridesBody = useCallback(() => {
    return {
      kind,
      extraMonthlySaveCents: 0,
      plannedMonthlySaveCents: parseDollars(plannedSave),
      extraIncomeCents: 0,
      incomeOverrideCents: useLedgerIncome ? null : parseDollars(income),
      otherDebtMonthlyCents: parseDollars(otherDebt),
      replaceHousing,
      emergencyMonths: Number(emergencyMonths) || 3,
      lookbackMonths,
      otherCashCents: parseDollars(otherCash),
      grossAnnualIncomeCents: grossAnnual.trim() === "" ? null : parseDollars(grossAnnual),
      housePriceCents: parseDollars(housePrice),
      downPct,
      mortgageRatePct: Number(rate) || 0,
      mortgageTermYears: termYears,
      propertyTaxPct: Number(taxPct) || 0,
      insuranceAnnualCents: parseDollars(insuranceAnnual),
      hoaMonthlyCents: parseDollars(hoa),
      pmiAnnualPct: Number(pmiPct) || 0,
      maintenancePct: Number(maintPct) || 0,
      closingCostPct: Number(closingPct) || 0,
      closingCostOverrideCents: useClosingPct ? null : parseDollars(closingDollars),
      carPriceCents: parseDollars(carPrice),
      carTaxPct: Number(carTaxPct) || 0,
      carFeesCents: parseDollars(carFees),
      carDownPct: carDownPct,
      carRatePct: Number(carRate) || 0,
      carTermMonths: carTerm,
      carInsuranceMonthlyCents: parseDollars(carIns),
      cashTargetCents: parseDollars(cashTarget),
      cashSavedOverrideCents: useLiquidForCash ? null : parseDollars(cashSaved),
    };
  }, [
    kind,
    plannedSave,
    income,
    useLedgerIncome,
    otherDebt,
    replaceHousing,
    emergencyMonths,
    lookbackMonths,
    otherCash,
    grossAnnual,
    housePrice,
    downPct,
    rate,
    termYears,
    taxPct,
    insuranceAnnual,
    hoa,
    pmiPct,
    maintPct,
    closingPct,
    closingDollars,
    useClosingPct,
    carPrice,
    carTaxPct,
    carFees,
    carDownPct,
    carRate,
    carTerm,
    carIns,
    cashTarget,
    cashSaved,
    useLiquidForCash,
  ]);

  const saveProfile = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/buy/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overridesBody()),
      });
      if (!res.ok) throw new Error("Save failed");
      const p = (await res.json()) as PurchasePlanDTO;
      if (snapshot) applyProfile(p, snapshot);
      setSaveMsg("Saved");
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const runCompute = useCallback(async () => {
    setComputing(true);
    try {
      const res = await fetch("/api/buy/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overridesBody()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Compute failed");
      setTips(Array.isArray(data.tips) ? data.tips : []);
      const nextSnap = data.snapshot as PurchaseLedgerSnapshot | undefined;
      if (nextSnap && typeof nextSnap.monthlyIncomeCents === "number") {
        setSnapshot(nextSnap);
        if (useLedgerIncome) setIncome(dollars(nextSnap.monthlyIncomeCents));
      }
      setResult(data as PurchaseResult);
    } catch {
      setResult(null);
    } finally {
      setComputing(false);
    }
  }, [overridesBody, useLedgerIncome]);

  useEffect(() => {
    if (!profile) return;
    if (computeTimer.current) window.clearTimeout(computeTimer.current);
    computeTimer.current = window.setTimeout(() => void runCompute(), 350);
    return () => {
      if (computeTimer.current) window.clearTimeout(computeTimer.current);
    };
  }, [profile, runCompute]);

  if (loadError) {
    return (
      <div className="panel">
        <p>{loadError}</p>
      </div>
    );
  }
  if (!snapshot || !profile) {
    return (
      <div className="panel">
        <p className="stat muted">Loading ledger snapshot…</p>
      </div>
    );
  }

  const priceCents = parseDollars(housePrice);

  return (
    <div className="retire-root">
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Setup</h2>
        <p className="stat muted" style={{ marginTop: 0 }}>
          Ledger ({lookbackPhrase(snapshot.lookbackMonths)}): income{" "}
          {formatMoney(snapshot.monthlyIncomeCents)}/mo · spend{" "}
          {formatMoney(snapshot.monthlySpendCents)}/mo · housing{" "}
          {formatMoney(snapshot.monthlyHousingCents)}/mo · save capacity{" "}
          {formatMoney(snapshot.saveCapacityCents)}/mo · liquid {formatMoney(snapshot.liquidCents)}
          {snapshot.creditDebtCents > 0 ? ` · cards ${formatMoney(snapshot.creditDebtCents)}` : ""}
        </p>

        <div className="retire-form-grid">
          <div className="field">
            <label htmlFor="buyKind">
              Purchase type
              <FieldHint text="House uses a mortgage stack (PITI, PMI, closing). Car is a loan plus insurance. Cash is a target amount with no loan." />
            </label>
            <select
              id="buyKind"
              value={kind}
              onChange={(e) => setKind(e.target.value as PurchaseKind)}
            >
              <option value="HOUSE">House</option>
              <option value="CAR">Car</option>
              <option value="CASH">Cash (vacation, reno, …)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="lookbackMonths">
              Ledger lookback
              <FieldHint text="How many months of transactions to average for income, spend, housing, surplus, and save capacity. Use 3 if imports do not go back a full year. Checking and savings balances are still current, not averaged." />
            </label>
            <select
              id="lookbackMonths"
              value={lookbackMonths}
              onChange={(e) => setLookbackMonths(Number(e.target.value) || 12)}
            >
              {LOOKBACK_MONTH_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "1 month" : `${n} months`}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="monthlyIncome">
              Monthly income
              <FieldHint text="Defaults to tracker income over the lookback window (transfers excluded). Uncheck to type take-home if the ledger is incomplete or you expect a different amount. Used for leftover, surplus, and monthly save — not DTI." />
            </label>
            <input
              id="monthlyIncome"
              inputMode="decimal"
              disabled={useLedgerIncome}
              value={income}
              onChange={(e) => setIncome(e.target.value)}
            />
            <label className="retire-check">
              <input
                type="checkbox"
                checked={useLedgerIncome}
                onChange={(e) => {
                  setUseLedgerIncome(e.target.checked);
                  if (e.target.checked) setIncome(dollars(snapshot.monthlyIncomeCents));
                }}
              />
              Use {lookbackPhrase(snapshot.lookbackMonths)} ledger income (
              {formatMoney(snapshot.monthlyIncomeCents)})
            </label>
          </div>
          <div className="field">
            <label htmlFor="grossAnnual">
              Gross annual income
              <FieldHint text="Household income before taxes and deductions (salary, bonuses, overtime, alimony, rental). Lenders divide this by 12 for DTI. Leave blank to skip DTI. Ledger take-home is not used for DTI." />
            </label>
            <input
              id="grossAnnual"
              inputMode="decimal"
              value={grossAnnual}
              onChange={(e) => setGrossAnnual(e.target.value)}
              placeholder="e.g. 120000"
            />
            {snapshot.monthlyIncomeCents > 0 && (
              <p className="stat muted" style={{ margin: "0.25rem 0 0" }}>
                Ledger take-home annualizes to about {formatMoney(snapshot.monthlyIncomeCents * 12)}{" "}
                (after tax) — DTI wants the larger pre-tax number.
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="otherDebt">
              Other debt payments $/mo
              <FieldHint text="Recurring debts besides the new mortgage: car loans, student loans, credit card minimums, child support. Added to PITI for back-end DTI (43% conventional rule of thumb)." />
            </label>
            <input
              id="otherDebt"
              inputMode="decimal"
              value={otherDebt}
              onChange={(e) => setOtherDebt(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="emergencyMonths">
              Emergency floor (months)
              <FieldHint text="Keeps this many months of spend out of “usable” down-payment cash so the plan does not drain checking to $0." />
            </label>
            <input
              id="emergencyMonths"
              value={emergencyMonths}
              onChange={(e) => setEmergencyMonths(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="otherCash">
              Other cash (not in ledger)
              <FieldHint text="One-time money HomeLedger does not have: expected proceeds after selling a house (sale price minus remaining mortgage and selling costs), a gift, or cash in another account. Added on top of usable checking/savings. Not held back by the emergency floor." />
            </label>
            <input
              id="otherCash"
              inputMode="decimal"
              value={otherCash}
              onChange={(e) => setOtherCash(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="plannedSave">
              Save toward this $/mo
              <FieldHint text="How much you plan to set aside each month for this purchase. Months to close = gap ÷ this number. Defaults to ledger surplus as a suggestion — change it to whatever you will actually save. Not added on top of surplus." />
            </label>
            <input
              id="plannedSave"
              inputMode="decimal"
              value={plannedSave}
              onChange={(e) => setPlannedSave(e.target.value)}
            />
            {snapshot.saveCapacityCents > 0 && (
              <p className="stat muted" style={{ margin: "0.25rem 0 0" }}>
                Ledger surplus / goal capacity is about {formatMoney(snapshot.saveCapacityCents)}/mo
                if you want a starting point.
              </p>
            )}
          </div>
        </div>

        {kind === "HOUSE" && (
          <>
            <div className="retire-checks">
              <div className="retire-check-wrap">
                <label className="retire-check">
                  <input
                    type="checkbox"
                    checked={replaceHousing}
                    onChange={(e) => setReplaceHousing(e.target.checked)}
                  />
                  Current rent/housing stops
                </label>
                <FieldHint text="Used for leftover: today’s Rent / Mortgage is treated as stopping so you are not charged both rent and the new house. It does not change how much you plan to save each month." />
              </div>
            </div>
            <div className="retire-form-grid">
              <div className="field">
                <label htmlFor="housePrice">
                  Home price
                  <FieldHint text="Purchase price in today’s dollars. Not a Zillow quote." />
                </label>
                <input
                  id="housePrice"
                  inputMode="decimal"
                  value={housePrice}
                  onChange={(e) => setHousePrice(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="downPct">
                  Down payment %
                  <FieldHint text="Below 20% adds a simple PMI estimate (~0.5%/year of the loan). Not a carrier quote." />
                </label>
                <input
                  id="downPct"
                  type="number"
                  min={0}
                  max={100}
                  value={downPct}
                  onChange={(e) => setDownPct(Number(e.target.value) || 0)}
                />
              </div>
              <div className="field">
                <label htmlFor="rate">
                  Mortgage rate %
                  <FieldHint text="Nominal annual rate. The engine amortizes a fixed loan; it does not shop lenders." />
                </label>
                <input id="rate" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="termYears">
                  Term (years)
                  <FieldHint text="Usually 15 or 30." />
                </label>
                <select
                  id="termYears"
                  value={termYears}
                  onChange={(e) => setTermYears(Number(e.target.value))}
                >
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="closingCosts">
                  Closing costs
                  <FieldHint text="Cash at closing besides the down payment (lender fees, title, prepaid taxes). Default is 3% of price. Uncheck to type a dollar quote from a lender." />
                </label>
                <input
                  id="closingCosts"
                  inputMode="decimal"
                  disabled={useClosingPct}
                  value={
                    useClosingPct
                      ? dollars(
                          Math.round(
                            (parseDollars(housePrice) * (Number(closingPct) || 0)) / 100
                          )
                        )
                      : closingDollars
                  }
                  onChange={(e) => setClosingDollars(e.target.value)}
                />
                <label className="retire-check">
                  <input
                    type="checkbox"
                    checked={useClosingPct}
                    onChange={(e) => {
                      const on = e.target.checked;
                      if (!on) {
                        setClosingDollars(
                          dollars(
                            Math.round(
                              (parseDollars(housePrice) * (Number(closingPct) || 0)) / 100
                            )
                          )
                        );
                      }
                      setUseClosingPct(on);
                    }}
                  />
                  Estimate as % of price
                </label>
                {useClosingPct && (
                  <label>
                    Percent of price
                    <input
                      aria-label="Closing costs percent"
                      value={closingPct}
                      onChange={(e) => setClosingPct(e.target.value)}
                    />
                  </label>
                )}
              </div>
            </div>
            <details className="retire-advanced">
              <summary>
                Taxes, insurance, HOA
                <FieldHint text="Assumptions, not quotes. Property tax and maintenance are % of price; insurance is $/year." />
              </summary>
              <div className="retire-form-grid" style={{ marginTop: "0.75rem" }}>
                <div className="field">
                  <label>Property tax % / year</label>
                  <input value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
                </div>
                <div className="field">
                  <label>Insurance $/year</label>
                  <input value={insuranceAnnual} onChange={(e) => setInsuranceAnnual(e.target.value)} />
                </div>
                <div className="field">
                  <label>HOA $/month</label>
                  <input value={hoa} onChange={(e) => setHoa(e.target.value)} />
                </div>
                <div className="field">
                  <label>PMI % / year of loan</label>
                  <input value={pmiPct} onChange={(e) => setPmiPct(e.target.value)} />
                </div>
                <div className="field">
                  <label>Maintenance % / year</label>
                  <input value={maintPct} onChange={(e) => setMaintPct(e.target.value)} />
                </div>
              </div>
            </details>
          </>
        )}

        {kind === "CAR" && (
          <div className="retire-form-grid">
            <div className="field">
              <label htmlFor="carPrice">
                Vehicle price
                <FieldHint text="Sticker price before tax and fees." />
              </label>
              <input
                id="carPrice"
                value={carPrice}
                onChange={(e) => setCarPrice(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Sales tax %</label>
              <input value={carTaxPct} onChange={(e) => setCarTaxPct(e.target.value)} />
            </div>
            <div className="field">
              <label>Fees $</label>
              <input value={carFees} onChange={(e) => setCarFees(e.target.value)} />
            </div>
            <div className="field">
              <label>Down %</label>
              <input
                type="number"
                min={0}
                max={100}
                value={carDownPct}
                onChange={(e) => setCarDownPct(Number(e.target.value) || 0)}
              />
            </div>
            <div className="field">
              <label>Loan rate %</label>
              <input value={carRate} onChange={(e) => setCarRate(e.target.value)} />
            </div>
            <div className="field">
              <label>Term (months)</label>
              <input
                type="number"
                min={12}
                max={96}
                value={carTerm}
                onChange={(e) => setCarTerm(Number(e.target.value) || 60)}
              />
            </div>
            <div className="field">
              <label>Insurance $/month</label>
              <input value={carIns} onChange={(e) => setCarIns(e.target.value)} />
            </div>
          </div>
        )}

        {kind === "CASH" && (
          <div className="retire-form-grid">
            <div className="field">
              <label htmlFor="cashTarget">
                Target amount
                <FieldHint text="What you need in today’s dollars. No loan." />
              </label>
              <input
                id="cashTarget"
                value={cashTarget}
                onChange={(e) => setCashTarget(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="cashSaved">Already saved</label>
              <input
                id="cashSaved"
                disabled={useLiquidForCash}
                value={cashSaved}
                onChange={(e) => setCashSaved(e.target.value)}
              />
              <label className="retire-check">
                <input
                  type="checkbox"
                  checked={useLiquidForCash}
                  onChange={(e) => setUseLiquidForCash(e.target.checked)}
                />
                Use liquid cash minus emergency floor
              </label>
            </div>
          </div>
        )}

        <div className="retire-actions">
          <button className="btn" type="button" onClick={() => void saveProfile()} disabled={saving}>
            {saving ? "Saving…" : "Save assumptions"}
          </button>
          {saveMsg && <span className="stat muted">{saveMsg}</span>}
        </div>
      </section>

      {result && (
        <>
          <section className="panel">
            <h2 style={{ marginTop: 0 }}>What-ifs</h2>
            <div className="retire-sliders">
              <label>
                Save toward this {formatMoney(parseDollars(plannedSave))}/mo
                <input
                  type="range"
                  min={0}
                  max={Math.max(parseDollars(plannedSave) * 2, 800000)}
                  step={5000}
                  value={parseDollars(plannedSave)}
                  onChange={(e) => setPlannedSave(dollars(Number(e.target.value)))}
                />
              </label>
              {result.extraSaveRealistic ? (
                <p className="stat muted" style={{ margin: 0 }}>
                  Ledger surplus over the {lookbackPhrase(result.lookbackMonths)} is{" "}
                  {formatMoney(result.monthlySurplusCents)}/mo. Your plan is{" "}
                  {formatMoney(result.savePerMonthCents)}/mo
                  {result.extraSaveHeadroomCents !== 0
                    ? ` (${formatMoney(result.extraSaveHeadroomCents)} vs that surplus)`
                    : ""}
                  .
                </p>
              ) : (
                <p className="tip warn" style={{ margin: 0 }}>
                  Planned save {formatMoney(result.savePerMonthCents)}/mo is above surplus over the{" "}
                  {lookbackPhrase(result.lookbackMonths)} of {formatMoney(result.monthlySurplusCents)}.
                  You would need to cut spend or raise income — the date still uses your typed amount.
                </p>
              )}
              <label>
                Other cash {formatMoney(parseDollars(otherCash))}
                <input
                  type="range"
                  min={0}
                  max={Math.max(parseDollars(otherCash) * 2, 50_000_000)}
                  step={500000}
                  value={parseDollars(otherCash)}
                  onChange={(e) => setOtherCash(dollars(Number(e.target.value)))}
                />
              </label>
              {kind === "HOUSE" && (
                <>
                  <label>
                    Price {formatMoney(priceCents)}
                    <input
                      type="range"
                      min={10000000}
                      max={Math.max(priceCents * 2, 80_000_000)}
                      step={500000}
                      value={priceCents}
                      onChange={(e) => setHousePrice(dollars(Number(e.target.value)))}
                    />
                  </label>
                  <label>
                    Down {downPct}%
                    <input
                      type="range"
                      min={0}
                      max={50}
                      step={1}
                      value={downPct}
                      onChange={(e) => setDownPct(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Rate {rate}%
                    <input
                      type="range"
                      min={2}
                      max={12}
                      step={0.125}
                      value={Number(rate) || 6.5}
                      onChange={(e) => setRate(e.target.value)}
                    />
                  </label>
                  {useClosingPct ? (
                    <label>
                      Closing {closingPct}% ({formatMoney(result.house?.closingCents ?? 0)})
                      <input
                        type="range"
                        min={0}
                        max={8}
                        step={0.25}
                        value={Number(closingPct) || 0}
                        onChange={(e) => setClosingPct(e.target.value)}
                      />
                    </label>
                  ) : (
                    <label>
                      Closing {formatMoney(parseDollars(closingDollars))}
                      <input
                        type="range"
                        min={0}
                        max={Math.max(parseDollars(closingDollars) * 2, 5_000_000)}
                        step={50000}
                        value={parseDollars(closingDollars)}
                        onChange={(e) => setClosingDollars(dollars(Number(e.target.value)))}
                      />
                    </label>
                  )}
                </>
              )}
            </div>
            {computing && <p className="stat muted">Updating…</p>}
          </section>

          <HowCalculated result={result} />

          {result.house && (
            <>
              <section className="panel retire-hero">
                <div className="retire-stats">
                  <Stat
                    label="PITI"
                    value={`${formatMoney(result.house.pitiCents)}/mo`}
                    hint="Monthly housing payment lenders use for DTI: principal & interest + property tax + insurance + HOA + PMI (PMI only if down is under 20%). Does not include the maintenance reserve."
                  />
                  <Stat
                    label="All-in (incl. upkeep)"
                    value={`${formatMoney(result.house.allInCents)}/mo`}
                    hint="PITI plus a maintenance reserve (your maintenance % of price, divided by 12). This is the house cost used in leftover — what the home costs each month beyond today’s other spending."
                  />
                  <Stat
                    label="Cash to close"
                    value={formatMoney(result.house.cashToCloseCents)}
                    hint="Cash you need at closing besides the loan: down payment + closing costs. Closing is either a % of price or the dollar amount you typed."
                  />
                  <Stat
                    label="Gap"
                    value={formatMoney(result.house.gapCents)}
                    hint="Cash still needed to close: cash to close minus available cash. Available is usable checking/savings after the emergency floor, plus other cash not in the ledger (sale proceeds, gift, etc.). $0 means you already have enough."
                  />
                  <Stat
                    label="Earliest (cash)"
                    value={
                      result.house.monthsToSave == null
                        ? "Need save rate"
                        : result.house.monthsToSave === 0
                          ? "Now"
                          : `${result.house.monthsToSave} mo · ${result.house.earliestDate}`
                    }
                    hint="How long to cover the gap at the monthly amount you typed under Save toward this. Months = gap ÷ that save rate. “Now” means the gap is $0. “Need save rate” means you have not entered a monthly save yet."
                  />
                  <Stat
                    label="Gross / mo (DTI)"
                    value={
                      result.grossMonthlyIncomeCents != null
                        ? formatMoney(result.grossMonthlyIncomeCents)
                        : "—"
                    }
                    hint="Your gross annual income ÷ 12. Pre-tax household income (salary, bonus, overtime, etc.). Used only for DTI. Leftover and surplus still use take-home from the ledger."
                  />
                  <Stat
                    label="Housing DTI"
                    value={
                      result.house.dtiFrontPct != null ? `${result.house.dtiFrontPct}%` : "Enter gross"
                    }
                    hint="Front-end ratio: PITI ÷ gross monthly income. Most lenders prefer 28% or lower. Not underwriting — enter gross annual income or this stays blank."
                  />
                  <Stat
                    label="Total DTI"
                    value={result.house.dtiBackPct != null ? `${result.house.dtiBackPct}%` : "Enter gross"}
                    hint="Back-end ratio: (PITI + other monthly debts you entered) ÷ gross monthly income. Conventional loans often cap this around 43–45%. Card minimums, car, student loans, and support belong in Other debt payments."
                  />
                  <Stat
                    label="Leftover / mo"
                    value={formatMoney(result.house.leftoverCents)}
                    hint="What’s left of take-home after today’s spending and the new house: income − lookback spend + rent that stops (if checked) − all-in housing. Uses take-home, not gross. Negative means the new house would overshoot the current budget."
                  />
                </div>
              </section>
              <section className="panel">
                <h2 style={{ marginTop: 0 }}>Payment stack</h2>
                <div className="table-wrap">
                  <table className="data">
                    <tbody>
                      <tr>
                        <td>Principal &amp; interest</td>
                        <td>{formatMoney(result.house.piCents)}</td>
                      </tr>
                      <tr>
                        <td>Property tax</td>
                        <td>{formatMoney(result.house.taxCents)}</td>
                      </tr>
                      <tr>
                        <td>Insurance</td>
                        <td>{formatMoney(result.house.insuranceCents)}</td>
                      </tr>
                      <tr>
                        <td>HOA</td>
                        <td>{formatMoney(result.house.hoaCents)}</td>
                      </tr>
                      <tr>
                        <td>PMI {result.house.downPct < 20 ? "(down under 20%)" : "(none)"}</td>
                        <td>{formatMoney(result.house.pmiCents)}</td>
                      </tr>
                      <tr>
                        <td>Maintenance reserve</td>
                        <td>{formatMoney(result.house.maintenanceCents)}</td>
                      </tr>
                      <tr>
                        <td>Down + closing</td>
                        <td>
                          {formatMoney(result.house.downCents)} + {formatMoney(result.house.closingCents)}
                        </td>
                      </tr>
                      <tr>
                        <td>Usable liquid (after emergency floor)</td>
                        <td>{formatMoney(result.usableLiquidCents)}</td>
                      </tr>
                      <tr>
                        <td>Other cash (not in ledger)</td>
                        <td>{formatMoney(result.otherCashCents)}</td>
                      </tr>
                      <tr>
                        <td>Available for this purchase</td>
                        <td>{formatMoney(result.availableCents)}</td>
                      </tr>
                      <tr>
                        <td>Vs today’s housing</td>
                        <td>
                          {result.house.vsRentCents >= 0 ? "+" : ""}
                          {formatMoney(result.house.vsRentCents)}/mo
                        </td>
                      </tr>
                      <tr>
                        <td>Rate +1% PITI</td>
                        <td>{formatMoney(result.house.rateShockPitiCents)}/mo</td>
                      </tr>
                      <tr>
                        <td>Price +10% cash to close</td>
                        <td>{formatMoney(result.house.priceShockCashToCloseCents)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="stat muted">{result.dtiNote}</p>
              </section>
            </>
          )}

          {result.car && (
            <section className="panel retire-hero">
              <div className="retire-stats">
                <Stat label="Out the door" value={formatMoney(result.car.outTheDoorCents)} />
                <Stat label="Loan payment" value={`${formatMoney(result.car.paymentCents)}/mo`} />
                <Stat label="Payment + insurance" value={`${formatMoney(result.car.monthlyAllInCents)}/mo`} />
                <Stat label="Down needed" value={formatMoney(result.car.downCents)} />
                <Stat label="Other cash" value={formatMoney(result.otherCashCents)} />
                <Stat label="Available" value={formatMoney(result.availableCents)} />
                <Stat label="Gap" value={formatMoney(result.car.gapCents)} />
                <Stat
                  label="Earliest"
                  value={
                    result.car.monthsToSave == null
                      ? "Need save rate"
                      : result.car.monthsToSave === 0
                        ? "Now"
                        : `${result.car.monthsToSave} mo · ${result.car.earliestDate}`
                  }
                />
                <Stat label="Leftover / mo" value={formatMoney(result.car.leftoverCents)} />
              </div>
            </section>
          )}

          {result.cash && (
            <section className="panel retire-hero">
              <div className="retire-stats">
                <Stat label="Target" value={formatMoney(result.cash.targetCents)} />
                <Stat label="Counted as saved" value={formatMoney(result.cash.savedCents)} />
                <Stat label="Other cash" value={formatMoney(result.otherCashCents)} />
                <Stat label="Gap" value={formatMoney(result.cash.gapCents)} />
                <Stat
                  label="Earliest"
                  value={
                    result.cash.monthsToSave == null
                      ? "Need save rate"
                      : result.cash.monthsToSave === 0
                        ? "Now"
                        : `${result.cash.monthsToSave} mo · ${result.cash.earliestDate}`
                  }
                />
                <Stat label="Save / mo" value={formatMoney(result.savePerMonthCents)} />
              </div>
            </section>
          )}

          <BuyAdvice tips={tips} />
        </>
      )}
    </div>
  );
}
