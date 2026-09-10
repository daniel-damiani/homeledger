"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";
import { RetireAdvice } from "./RetireAdvice";
import { RetireChart } from "./RetireChart";
import type {
  LedgerSnapshot,
  RetirementAdviceTip,
  RetirementProfileDTO,
  RetirementResult,
  TaxBucketKind,
} from "@/lib/retirement";

const BUCKETS: { id: TaxBucketKind; label: string }[] = [
  { id: "TRADITIONAL", label: "Traditional" },
  { id: "ROTH", label: "Roth" },
  { id: "TAXABLE", label: "Taxable" },
  { id: "UNKNOWN", label: "Auto" },
];

function dollars(cents: number): string {
  return (cents / 100).toFixed(0);
}

function parseDollars(raw: string): number {
  const n = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
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

function SuccessRing({ pct, longevity }: { pct: number; longevity: number }) {
  const size = 180;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const capped = Math.min(100, Math.max(0, pct));
  const offset = c * (1 - capped / 100);
          const tone = pct >= 90 ? "ok" : pct >= 70 ? "amber" : "low";
  return (
    <div className="tracker-ring" aria-label={`${pct}% of simulations last to age ${longevity}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="tracker-ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className={`tracker-ring-fill${tone ? ` ${tone}` : ""}`}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="tracker-ring-label">
        <div className="stat">{pct.toFixed(1)}%</div>
        <div className="stat muted">
          of simulated markets last to age {longevity}
        </div>
      </div>
    </div>
  );
}

export function RetireView() {
  const [snapshot, setSnapshot] = useState<LedgerSnapshot | null>(null);
  const [profile, setProfile] = useState<RetirementProfileDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [birthYear, setBirthYear] = useState("");
  const [retireAge, setRetireAge] = useState(65);
  const [longevityAge, setLongevityAge] = useState(95);
  const [ssFraMonthly, setSsFraMonthly] = useState("0");
  const [ssClaimAge, setSsClaimAge] = useState(67);
  const [desiredSpend, setDesiredSpend] = useState("");
  const [useTrailingSpend, setUseTrailingSpend] = useState(true);
  const [stockPct, setStockPct] = useState(70);
  const [glidePath, setGlidePath] = useState(false);
  const [includeSavings, setIncludeSavings] = useState(false);
  const [extraMonthly, setExtraMonthly] = useState(0);
  const [stockReturnPct, setStockReturnPct] = useState("7");
  const [bondReturnPct, setBondReturnPct] = useState("4");
  const [inflationPct, setInflationPct] = useState("2.5");
  const [taxHaircut, setTaxHaircut] = useState("15");
  const [buckets, setBuckets] = useState<Record<string, TaxBucketKind>>({});

  const [annualSpendCents, setAnnualSpendCents] = useState(0);
  const [result, setResult] = useState<RetirementResult | null>(null);
  const [computing, setComputing] = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);

  const [tips, setTips] = useState<RetirementAdviceTip[]>([]);

  const computeTimer = useRef<number | null>(null);

  const applyProfile = useCallback((p: RetirementProfileDTO, snap: LedgerSnapshot) => {
    setProfile(p);
    setBirthYear(p.birthYear != null ? String(p.birthYear) : "");
    setRetireAge(p.retireAge);
    setLongevityAge(p.longevityAge);
    setSsFraMonthly(dollars(p.ssFraMonthlyCents));
    setSsClaimAge(p.ssClaimAge);
    setUseTrailingSpend(p.desiredAnnualSpendCents == null);
    setDesiredSpend(
      p.desiredAnnualSpendCents != null
        ? dollars(p.desiredAnnualSpendCents)
        : dollars(snap.trailingSpendCents)
    );
    setStockPct(p.stockPct);
    setGlidePath(p.glidePath);
    setIncludeSavings(p.includeSavings);
    setExtraMonthly(Math.round(p.extraMonthlySaveCents / 100));
    setStockReturnPct(String(p.stockReturnPct));
    setBondReturnPct(String(p.bondReturnPct));
    setInflationPct(String(p.inflationPct));
    setTaxHaircut(String(p.traditionalTaxHaircutPct));
    setAnnualSpendCents(p.desiredAnnualSpendCents ?? snap.trailingSpendCents);
    const map: Record<string, TaxBucketKind> = {};
    for (const a of snap.accounts) map[a.id] = a.taxBucket;
    setBuckets(map);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/retire/snapshot");
        if (!res.ok) throw new Error(res.status === 401 ? "Unlock first" : "Failed to load");
        const data = (await res.json()) as { snapshot: LedgerSnapshot; profile: RetirementProfileDTO };
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

  const profileBody = useCallback(() => {
    const year = Number(birthYear);
    return {
      birthYear: Number.isFinite(year) && year >= 1920 ? year : null,
      retireAge,
      longevityAge,
      ssFraMonthlyCents: parseDollars(ssFraMonthly),
      ssClaimAge,
      desiredAnnualSpendCents: useTrailingSpend ? null : parseDollars(desiredSpend),
      stockPct,
      glidePath,
      includeSavings,
      extraMonthlySaveCents: extraMonthly * 100,
      stockReturnPct: Number(stockReturnPct) || 7,
      bondReturnPct: Number(bondReturnPct) || 4,
      inflationPct: Number(inflationPct) || 2.5,
      traditionalTaxHaircutPct: Number(taxHaircut) || 15,
      buckets: Object.entries(buckets).map(([id, taxBucket]) => ({ id, taxBucket })),
    };
  }, [
    birthYear,
    retireAge,
    longevityAge,
    ssFraMonthly,
    ssClaimAge,
    useTrailingSpend,
    desiredSpend,
    stockPct,
    glidePath,
    includeSavings,
    extraMonthly,
    stockReturnPct,
    bondReturnPct,
    inflationPct,
    taxHaircut,
    buckets,
  ]);

  const saveProfile = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/retire/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileBody()),
      });
      if (!res.ok) throw new Error("Save failed");
      const p = (await res.json()) as RetirementProfileDTO;
      setProfile(p);
      setSaveMsg("Saved");
      const snapRes = await fetch("/api/retire/snapshot");
      if (snapRes.ok) {
        const data = (await snapRes.json()) as { snapshot: LedgerSnapshot; profile: RetirementProfileDTO };
        setSnapshot(data.snapshot);
        applyProfile(data.profile, data.snapshot);
      }
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const runCompute = useCallback(async () => {
    if (!birthYear) {
      setResult(null);
      setTips([]);
      return;
    }
    setComputing(true);
    setComputeError(null);
    try {
      const spend = useTrailingSpend
        ? snapshot?.trailingSpendCents ?? 0
        : parseDollars(desiredSpend) || annualSpendCents;
      const res = await fetch("/api/retire/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthYear: Number(birthYear) || undefined,
          retireAge,
          extraMonthlySaveCents: extraMonthly * 100,
          annualSpendCents: spend,
          ssClaimAge,
          stockPct,
          glidePath,
          includeSavings,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Compute failed");
      setTips(Array.isArray(data.tips) ? data.tips : []);
      setResult(data as RetirementResult);
      setAnnualSpendCents(spend);
    } catch (e) {
      setComputeError(e instanceof Error ? e.message : "Compute failed");
    } finally {
      setComputing(false);
    }
  }, [
    birthYear,
    snapshot,
    useTrailingSpend,
    desiredSpend,
    annualSpendCents,
    retireAge,
    extraMonthly,
    ssClaimAge,
    stockPct,
    glidePath,
    includeSavings,
  ]);

  useEffect(() => {
    if (!snapshot || !profile?.birthYear && !birthYear) return;
    if (computeTimer.current) window.clearTimeout(computeTimer.current);
    computeTimer.current = window.setTimeout(() => {
      void runCompute();
    }, 350);
    return () => {
      if (computeTimer.current) window.clearTimeout(computeTimer.current);
    };
  }, [snapshot, profile, birthYear, runCompute]);

  const currentAge = useMemo(() => {
    const y = Number(birthYear);
    if (!snapshot || !Number.isFinite(y)) return null;
    return snapshot.currentYear - y;
  }, [birthYear, snapshot]);

  const nestPreview = snapshot
    ? snapshot.investmentCents + (includeSavings ? snapshot.savingsCents : 0)
    : 0;

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

  const spendSliderMax = Math.max(snapshot.trailingSpendCents * 2, 20_000_000);
  const spendForSlider = useTrailingSpend ? snapshot.trailingSpendCents : annualSpendCents;

  return (
    <div className="retire-root">
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Setup</h2>
        <p className="stat muted" style={{ marginTop: 0 }}>
          Ledger prefill: nest egg {formatMoney(nestPreview)} · trailing-12 spend{" "}
          {formatMoney(snapshot.trailingSpendCents)} · saving rate{" "}
          {formatMoney(snapshot.annualSavingCents)}/yr
          {snapshot.emergencyMonths != null
            ? ` · ${snapshot.emergencyMonths} months cash buffer`
            : ""}
          {snapshot.creditDebtCents > 0 ? ` · cards ${formatMoney(snapshot.creditDebtCents)}` : ""}
        </p>

        <div className="retire-form-grid">
          <div className="field">
            <label htmlFor="birthYear">
              Birth year
              <FieldHint text="Calendar year you were born — not a full date of birth. Used only to compute your current age and years until retirement." />
            </label>
            <input
              id="birthYear"
              inputMode="numeric"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              placeholder="1986"
            />
          </div>
          <div className="field">
            <label htmlFor="retireAgeSetup">
              Target retirement age
              <FieldHint text="Age you plan to stop contributing and start withdrawals. The nest egg grows with savings until this age, then spending begins." />
            </label>
            <input
              id="retireAgeSetup"
              type="number"
              min={40}
              max={85}
              value={retireAge}
              onChange={(e) => setRetireAge(Number(e.target.value) || 65)}
            />
          </div>
          <div className="field">
            <label htmlFor="longevityAge">
              Planning age (longevity)
              <FieldHint text="How long the plan must last. Success means the nest egg never hits $0 before this age. 95 is a conservative default." />
            </label>
            <input
              id="longevityAge"
              type="number"
              min={70}
              max={110}
              value={longevityAge}
              onChange={(e) => setLongevityAge(Number(e.target.value) || 95)}
            />
          </div>
          <div className="field">
            <label htmlFor="ssFra">
              Social Security at FRA (67), $/month
              <FieldHint text="Your estimated monthly benefit at full retirement age (67), before claiming-age adjustments. Enter 0 if unknown — the engine will not invent a benefit. Not an SSA.gov quote." />
            </label>
            <input
              id="ssFra"
              inputMode="decimal"
              value={ssFraMonthly}
              onChange={(e) => setSsFraMonthly(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="ssClaim">
              SS claiming age
              <FieldHint text="When you start Social Security. The engine scales your FRA amount with a rule of thumb: about 30% less at 62, full at 67, about 24% more at 70." />
            </label>
            <select
              id="ssClaim"
              value={ssClaimAge}
              onChange={(e) => setSsClaimAge(Number(e.target.value))}
            >
              <option value={62}>62 (~30% cut)</option>
              <option value={67}>67 (full)</option>
              <option value={70}>70 (~24% boost)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="stockPct">
              Stock %
              <FieldHint text="Share of the nest egg in stocks; the rest is treated as bonds. Default 70/30. With glide path on, this is the starting mix today." />
            </label>
            <input
              id="stockPct"
              type="number"
              min={0}
              max={100}
              value={stockPct}
              onChange={(e) => setStockPct(Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="desiredSpend">
            Desired annual retirement spend
            <FieldHint text="What you expect to spend per year in retirement, in today’s dollars. Defaults to trailing-12 tracker spend (transfers excluded, reimbursements netted)." />
          </label>
          <input
            id="desiredSpend"
            inputMode="decimal"
            disabled={useTrailingSpend}
            value={desiredSpend}
            onChange={(e) => setDesiredSpend(e.target.value)}
          />
          <div className="retire-check-wrap">
            <label className="retire-check">
              <input
                type="checkbox"
                checked={useTrailingSpend}
                onChange={(e) => {
                  setUseTrailingSpend(e.target.checked);
                  if (e.target.checked) setDesiredSpend(dollars(snapshot.trailingSpendCents));
                }}
              />
              Use trailing-12 tracker spend ({formatMoney(snapshot.trailingSpendCents)})
            </label>
            <FieldHint text="Uses the last 12 months of tracker spending as the retirement budget. Uncheck to type a different annual amount." />
          </div>
        </div>

        <div className="retire-checks">
          <div className="retire-check-wrap">
            <label className="retire-check">
              <input
                type="checkbox"
                checked={includeSavings}
                onChange={(e) => setIncludeSavings(e.target.checked)}
              />
              Include savings accounts in nest egg
            </label>
            <FieldHint text="Adds SAVINGS balances to the nest egg. Checking and debts stay out either way." />
          </div>
          <div className="retire-check-wrap">
            <label className="retire-check">
              <input
                type="checkbox"
                checked={glidePath}
                onChange={(e) => setGlidePath(e.target.checked)}
              />
              Glide path (stocks drift toward 40% by retirement)
            </label>
            <FieldHint text="Stocks start at your Stock % today and drift toward 40% by retirement, then stay there — a simple age-into-bonds path." />
          </div>
        </div>

        <details className="retire-advanced">
          <summary>
            Return assumptions (nominal) and tax haircut
            <FieldHint text="These are annual returns before inflation. The engine converts them to today’s dollars. Click Save assumptions after you change these — sliders alone will not pick them up." />
          </summary>
          <div className="retire-form-grid" style={{ marginTop: "0.75rem" }}>
            <div className="field">
              <label htmlFor="stockReturnPct">
                Stocks %
                <FieldHint text="Expected long-run annual return on the stock share, before inflation. Default 7%." />
              </label>
              <input
                id="stockReturnPct"
                value={stockReturnPct}
                onChange={(e) => setStockReturnPct(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="bondReturnPct">
                Bonds %
                <FieldHint text="Expected long-run annual return on the bond share, before inflation. Default 4%." />
              </label>
              <input
                id="bondReturnPct"
                value={bondReturnPct}
                onChange={(e) => setBondReturnPct(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="inflationPct">
                Inflation %
                <FieldHint text="Used to convert those nominal returns into real (today’s dollar) returns. Default 2.5%." />
              </label>
              <input
                id="inflationPct"
                value={inflationPct}
                onChange={(e) => setInflationPct(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="taxHaircut">
                Traditional tax haircut %
                <FieldHint text="Extra withdrawal applied to Traditional (pre-tax) balances so a 401k is not treated like Roth. Default 15%. Not a full tax engine — no brackets, RMDs, or Roth conversions." />
              </label>
              <input
                id="taxHaircut"
                value={taxHaircut}
                onChange={(e) => setTaxHaircut(e.target.value)}
              />
            </div>
          </div>
          <p className="stat muted">Engine works in today’s dollars after inflation. Save to apply return changes.</p>
        </details>

        {snapshot.accounts.length > 0 && (
          <div className="retire-accounts">
            <h3>
              Account tax buckets
              <FieldHint text="How each account is taxed in retirement. Traditional gets the haircut; Roth and Taxable do not. Auto infers from the name (Roth, 401k, brokerage)." />
            </h3>
            <p className="stat muted" style={{ marginTop: 0 }}>
              Traditional withdrawals get the tax haircut. Auto infers Roth / 401k / brokerage from the name.
            </p>
            <ul className="retire-account-list">
              {snapshot.accounts.map((a) => (
                <li key={a.id}>
                  <div>
                    <strong>{a.name}</strong>
                    <span className="stat muted">
                      {" "}
                      {a.type} · {formatMoney(a.balanceCents)}
                      {a.taxBucket === "UNKNOWN" ? ` · inferred ${a.inferredBucket}` : ""}
                    </span>
                  </div>
                  <div className="retire-chips">
                    {BUCKETS.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        className={`retire-chip${(buckets[a.id] ?? a.taxBucket) === b.id ? " on" : ""}`}
                        onClick={() => setBuckets((prev) => ({ ...prev, [a.id]: b.id }))}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="retire-actions">
          <button className="btn" type="button" onClick={() => void saveProfile()} disabled={saving}>
            {saving ? "Saving…" : "Save assumptions"}
          </button>
          {saveMsg && <span className="stat muted">{saveMsg}</span>}
          {currentAge != null && <span className="stat muted">Current age ~{currentAge}</span>}
        </div>
      </section>

      {!birthYear && (
        <div className="panel">
          <p>Enter a birth year (not a full date of birth) so the engine knows how many years you have to save.</p>
        </div>
      )}

      {computeError && (
        <div className="panel forecast-alert warn">
          <p>{computeError}</p>
        </div>
      )}

      {result && (
        <>
          <section className="panel retire-hero">
            <SuccessRing pct={result.successPct} longevity={result.longevityAge} />
            <div className="retire-stats">
              <div>
                <span className="stat muted">Nest egg now</span>
                <span className="stat">{formatMoney(result.nestEggNowCents)}</span>
              </div>
              <div>
                <span className="stat muted">At retirement (expected)</span>
                <span className="stat">{formatMoney(result.nestEggAtRetireCents)}</span>
              </div>
              <div>
                <span className="stat muted">90% safe spend</span>
                <span className="stat">{formatMoney(result.impliedSafeSpendCents)}/yr</span>
              </div>
              <div>
                <span className="stat muted">4% rule</span>
                <span className="stat">{formatMoney(result.fourPctSpendCents)}/yr</span>
              </div>
              <div>
                <span className="stat muted">Extra to hit 90%</span>
                <span className="stat">
                  {result.extraMonthlyTo90Cents > 0
                    ? `${formatMoney(result.extraMonthlyTo90Cents)}/mo`
                    : "Already there"}
                </span>
              </div>
              <div>
                <span className="stat muted">Earliest ~90% age</span>
                <span className="stat">
                  {result.earliestRetireAge != null ? result.earliestRetireAge : "Not in range"}
                </span>
              </div>
            </div>
            {computing && <p className="stat muted retire-computing">Updating…</p>}
          </section>

          <section className="panel">
            <h2 style={{ marginTop: 0 }}>What-ifs</h2>
            <div className="retire-sliders">
              <label>
                Retire at {retireAge}
                <input
                  type="range"
                  min={Math.max(40, currentAge ?? 30)}
                  max={Math.min(85, longevityAge - 5)}
                  value={retireAge}
                  onChange={(e) => setRetireAge(Number(e.target.value))}
                />
              </label>
              <label>
                Extra save {formatMoney(extraMonthly * 100)}/mo
                <input
                  type="range"
                  min={0}
                  max={3000}
                  step={50}
                  value={extraMonthly}
                  onChange={(e) => setExtraMonthly(Number(e.target.value))}
                />
              </label>
              <label>
                Annual spend {formatMoney(spendForSlider)}
                <input
                  type="range"
                  min={0}
                  max={spendSliderMax}
                  step={10000}
                  value={spendForSlider}
                  onChange={(e) => {
                    setUseTrailingSpend(false);
                    const cents = Number(e.target.value);
                    setAnnualSpendCents(cents);
                    setDesiredSpend(dollars(cents));
                  }}
                />
              </label>
              <label>
                SS claim age {ssClaimAge}
                <input
                  type="range"
                  min={62}
                  max={70}
                  step={1}
                  value={ssClaimAge}
                  onChange={(e) => setSsClaimAge(Number(e.target.value))}
                />
              </label>
            </div>
            <p className="stat muted">{result.ssScaleNote}</p>
          </section>

          <section className="panel">
            <h2 style={{ marginTop: 0 }}>Nest egg through longevity</h2>
            <p className="stat muted" style={{ marginTop: 0 }}>
              Shaded band is the 10th–90th percentile of {result.nSims} simulated markets. Dashed line is the
              expected-return path. Amounts are today’s dollars.
            </p>
            <RetireChart path={result.path} />
          </section>

          <section className="panel">
            <h2 style={{ marginTop: 0 }}>Coast-FIRE</h2>
            <p>
              If contributions stop today, <strong>{result.coastSuccessPct}%</strong> of simulated markets still
              last to age {result.longevityAge}.
            </p>
          </section>

          {result.ageCompare.length > 0 && (
            <section className="panel">
              <h2 style={{ marginTop: 0 }}>Retire at 62 / 65 / 67</h2>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Age</th>
                      <th>Success</th>
                      <th>Expected nest egg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.ageCompare.map((row) => (
                      <tr key={row.retireAge}>
                        <td>{row.retireAge}</td>
                        <td>{row.successPct.toFixed(1)}%</td>
                        <td>{formatMoney(row.nestEggAtRetireCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <RetireAdvice tips={tips} />
        </>
      )}
    </div>
  );
}
