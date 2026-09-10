import { AppNav } from "@/components/AppNav";
import { BuyView } from "@/components/buy/BuyView";
import { ensureSettings } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function BuyPage() {
  await ensureSettings();

  return (
    <main className="shell shell-wide">
      <AppNav pathname="/buy" />
      <h1>Buy</h1>
      <p className="lede" style={{ marginTop: 0 }}>
        Prefills income, spending, and cash from your ledger, then runs a local plan for a house, car,
        or cash goal.
      </p>
      <BuyView />
    </main>
  );
}
