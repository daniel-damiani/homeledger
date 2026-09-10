"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface Account {
  id: string;
  name: string;
}

export function BatchFilterBar({ accounts, currentAccountId }: { accounts: Account[]; currentAccountId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value) {
      params.set("account", e.target.value);
    } else {
      params.delete("account");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem" }}>
      <label htmlFor="batch-account-filter" style={{ fontSize: "0.9rem", fontWeight: 500 }}>
        Filter by account
      </label>
      <select id="batch-account-filter" value={currentAccountId} onChange={onChange}>
        <option value="">All accounts</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  );
}
