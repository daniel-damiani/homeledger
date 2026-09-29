import Link from "next/link";
import { Money } from "@/components/Money";
import { AccountDownloadLink } from "@/components/AccountDownloadLink";
import { SimpleFINSyncButton } from "@/components/SimpleFINSyncButton";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { ReconcileButton } from "@/components/ReconcileButton";

export type AccountCardData = {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  currency: string;
  balanceCents: number;
  availableBalanceCents: number | null;
  simpleFinId: string | null;
  simpleFinLastSyncAt: Date | null;
  downloadUrl: string | null;
};

function txnHref(accountId: string) {
  return `/transactions?accountId=${encodeURIComponent(accountId)}`;
}

export function AccountCard({
  account,
  archived = false,
}: {
  account: AccountCardData;
  archived?: boolean;
}) {
  const href = txnHref(account.id);

  return (
    <section className={`panel account-tile${archived ? " account-tile-archived" : ""}`}>
      <div className="account-tile-head">
        <Link href={href} className="account-tile-link">
          <h3 className="account-tile-name">{account.name}</h3>
        </Link>
        <DeleteAccountButton accountId={account.id} accountName={account.name} />
      </div>

      <Link href={href} className="account-tile-body">
        <div className="stat">
          <Money cents={account.balanceCents} currency={account.currency} />
        </div>
        {account.availableBalanceCents != null &&
        account.availableBalanceCents !== account.balanceCents ? (
          <p className="stat muted account-tile-meta">
            <Money cents={account.availableBalanceCents} currency={account.currency} /> available
          </p>
        ) : null}
        {!archived && account.institution ? (
          <p className="stat muted account-tile-meta">{account.institution}</p>
        ) : null}
        {archived ? (
          <p className="stat muted account-tile-meta">
            {account.type}
            {account.institution ? ` · ${account.institution}` : ""}
          </p>
        ) : null}
        <p className="stat muted account-tile-hint">View transactions →</p>
      </Link>

      {!archived ? (
        <div className="account-tile-actions">
          {account.simpleFinId ? (
            <SimpleFINSyncButton
              accountId={account.id}
              lastSyncAt={account.simpleFinLastSyncAt?.toISOString() ?? null}
            />
          ) : (
            <AccountDownloadLink accountId={account.id} initialUrl={account.downloadUrl ?? null} />
          )}
          <ReconcileButton accountId={account.id} accountBalanceCents={account.balanceCents} />
        </div>
      ) : null}
    </section>
  );
}
