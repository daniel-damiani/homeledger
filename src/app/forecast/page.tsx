import { AppNav } from "@/components/AppNav";
import { ForecastView } from "@/components/forecast/ForecastView";
import { ensureSettings } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ForecastPage() {
  await ensureSettings();

  const accounts = await prisma.account.findMany({
    where: {
      archived: false,
      type: { in: ["CHECKING", "CASH"] },
    },
    select: {
      id: true,
      name: true,
      balanceCents: true,
      availableBalanceCents: true,
    },
    orderBy: { name: "asc" },
  });

  return (
    <main className="shell shell-wide">
      <AppNav pathname="/forecast" />
      <h1>Cash Forecast</h1>
      <p className="lede" style={{ marginTop: 0 }}>
        Select your main checking account and confirm your paycheck schedule to see a
        60-day running balance projection, upcoming bills, and a savings-transfer alert
        if your balance dips too low.
      </p>

      {accounts.length === 0 ? (
        <div className="panel">
          <p>No CHECKING accounts found. Add one on the <a href="/accounts">Accounts</a> page first.</p>
        </div>
      ) : (
        <ForecastView accounts={accounts} />
      )}
    </main>
  );
}
