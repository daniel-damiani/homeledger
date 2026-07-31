import { AppNav } from "@/components/AppNav";
import { PinChangeForm } from "@/components/PinChangeForm";
import { ensureSettings } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await ensureSettings();

  return (
    <main className="shell">
      <AppNav pathname="/settings" />
      <h1>Settings</h1>
      <p className="lede">
        Currency {settings.currency} · month starts on day {settings.monthStartDay}. Data lives in
        local Postgres — use scripts/backup.ps1 for dumps.
      </p>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <PinChangeForm />
        <section className="panel">
          <h2>Ops</h2>
          <ul>
            <li>
              Health: <a href="/api/health">/api/health</a>
            </li>
            <li>
              Backup: <code>.\scripts\backup.ps1</code>
            </li>
            <li>
              Restore: <code>.\scripts\restore.ps1 -DumpFile ...</code>
            </li>
            <li>
              Fixtures: <code>fixtures/sample-chase.csv</code>
            </li>
          </ul>
          <p className="stat muted">Never commit .env, dumps, or real statements.</p>
        </section>
      </div>
    </main>
  );
}