import { AppNav } from "@/components/AppNav";
import { PinChangeForm } from "@/components/PinChangeForm";
import { ensureSettings, IDLE_LOCK_MINUTES } from "@/lib/auth";

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
          <h2>Session lock</h2>
          <p>
            The app locks after <strong>{IDLE_LOCK_MINUTES} minutes</strong> of inactivity, and when you
            quit the browser (session cookie). Use Lock in the header anytime.
          </p>
          <p className="stat muted">
            Chrome “Continue where you left off” can restore a session cookie; the{" "}
            {IDLE_LOCK_MINUTES}-minute timer still applies if you were away longer than that.
          </p>
        </section>
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