import { AppNav } from "@/components/AppNav";
import { Money } from "@/components/Money";
import { ProgressBar } from "@/components/ProgressBar";
import { GoalForm } from "@/components/GoalForm";
import { SweepButton } from "@/components/SweepButton";
import { CoachPanel } from "@/components/CoachPanel";
import { suggestedMonthlyContribution, buildCoachTips } from "@/lib/coaching";
import { prisma } from "@/lib/db";
import { formatMonthKey } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const goals = await prisma.goal.findMany({ orderBy: { createdAt: "desc" } });
  const tips = await buildCoachTips(formatMonthKey());

  return (
    <main className="shell">
      <AppNav pathname="/goals" />
      <h1>Goals</h1>
      <p className="lede">Suggested monthly contribution keeps you on a target date.</p>

      <div className="grid" style={{ gridTemplateColumns: "1.2fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <section className="panel">
          <h2>Active &amp; recent</h2>
          {goals.map((g) => {
            const suggested = suggestedMonthlyContribution(
              g.targetCents,
              g.currentCents,
              g.targetDate
            );
            return (
              <div key={g.id} style={{ marginBottom: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                  <strong>
                    {g.name} <span className="stat muted">({g.status})</span>
                  </strong>
                  <span>
                    <Money cents={g.currentCents} /> / <Money cents={g.targetCents} />
                  </span>
                </div>
                <ProgressBar value={g.currentCents} max={g.targetCents} />
                <p className="stat muted">
                  Suggested ~<Money cents={suggested} /> / mo
                  {g.targetDate
                    ? ` · by ${g.targetDate.toISOString().slice(0, 10)}`
                    : ""}
                </p>
                {g.status === "ACTIVE" ? <SweepButton goalId={g.id} /> : null}
              </div>
            );
          })}
          {goals.length === 0 ? <p>No goals yet.</p> : null}
        </section>
        <GoalForm />
      </div>

      <CoachPanel tips={tips} />
    </main>
  );
}