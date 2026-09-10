import { AppNav } from "@/components/AppNav";
import { RetireView } from "@/components/retire/RetireView";
import { ensureSettings } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RetirePage() {
  await ensureSettings();

  return (
    <main className="shell shell-wide">
      <AppNav pathname="/retire" />
      <h1>Retire</h1>
      <p className="lede" style={{ marginTop: 0 }}>
        Prefills nest egg, spending, and saving from your ledger, then runs a local Monte Carlo.
      </p>
      <RetireView />
    </main>
  );
}
