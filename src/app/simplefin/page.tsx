import { AppNav } from "@/components/AppNav";
import { SimpleFINPanel } from "@/components/SimpleFINPanel";
import { prisma } from "@/lib/db";
import { listAccounts } from "@/lib/accounts";

export const dynamic = "force-dynamic";

export default async function SimpleFINPage() {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  const connected = Boolean(settings?.simpleFinAccessUrl);
  const hasEnvToken = Boolean(process.env.SIMPLEFIN_TOKEN);

  const accounts = await listAccounts();
  const hlAccounts = accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }));

  return (
    <main className="shell">
      <AppNav pathname="/simplefin" />
      <h1>SimpleFIN</h1>
      <p className="lede" style={{ marginTop: 0 }}>
        Connect your bank accounts via{" "}
        <a href="https://bridge.simplefin.org" target="_blank" rel="noopener noreferrer">
          SimpleFIN Bridge
        </a>{" "}
        for automatic transaction sync — no manual downloads needed.
      </p>

      <section className="panel">
        <SimpleFINPanel
          connected={connected}
          hlAccounts={hlAccounts}
          hasEnvToken={hasEnvToken}
        />
      </section>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>How it works</h2>
        <ol style={{ lineHeight: 1.9, paddingLeft: "1.25rem" }}>
          <li>
            <strong>Get a token</strong> —{" "}
            <a href="https://bridge.simplefin.org/simplefin/create" target="_blank" rel="noopener noreferrer">
              Create a SimpleFIN account
            </a>{" "}
            ($1.50/mo or $15/yr) and add your banks. Copy the Setup Token from your dashboard.
          </li>
          <li>
            <strong>Connect</strong> — paste the token in the form above and click Connect.
            The token is claimed once and the resulting Access URL is stored securely in your
            local database. The raw token is never saved.
          </li>
          <li>
            <strong>Link</strong> — map each SimpleFIN account to a HomeLedger account (or create
            a new one).
          </li>
          <li>
            <strong>Sync</strong> — click "Sync now" (or "Sync all" on the Accounts page) to pull
            transactions. Only new transactions are imported; duplicates are skipped automatically.
          </li>
        </ol>
        <p className="tip">
          Transactions travel directly from your bank → SimpleFIN → this app running locally.
          No financial data is stored or processed by any third party beyond SimpleFIN itself.
        </p>
        <h3 style={{ marginTop: "1rem" }}>Rate limits</h3>
        <p style={{ fontSize: "0.9rem", lineHeight: 1.6, margin: "0 0 0.5rem" }}>
          SimpleFIN allows <strong>24 requests per day</strong> per Access URL. Each incremental
          sync uses <strong>1 request</strong> per account. Historical syncs ({">"} 85 days) use
          multiple requests — one per 85-day window.
        </p>
        <p style={{ fontSize: "0.9rem", lineHeight: 1.6, margin: 0 }}>
          To see your actual usage and quota,{" "}
          <a href="https://bridge.simplefin.org/auth/login" target="_blank" rel="noopener noreferrer">
            sign in to SimpleFIN Bridge
          </a>{" "}
          — your dashboard shows recent request counts and any errors per bank connection.
          If you&apos;ve hit the limit, wait a few hours; quotas replenish throughout the day.
        </p>
      </section>
    </main>
  );
}
