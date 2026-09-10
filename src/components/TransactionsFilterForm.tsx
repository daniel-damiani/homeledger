import Link from "next/link";

export type TxnFilterValues = {
  from?: string;
  to?: string;
  accountId?: string;
  payee?: string;
  amountMin?: string;
  amountMax?: string;
  amount?: string;
  categoryId?: string;
  group?: string;
};

export function TransactionsFilterForm({
  accounts,
  categories,
  groups,
  values,
}: {
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string; group: string }[];
  groups: string[];
  values: TxnFilterValues;
}) {
  return (
    <form className="panel" method="get" action="/transactions">
      <h2>Filters</h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "0.75rem",
          alignItems: "end",
        }}
      >
        <div className="field">
          <label htmlFor="from">From date</label>
          <input id="from" name="from" type="date" defaultValue={values.from ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="to">To date</label>
          <input id="to" name="to" type="date" defaultValue={values.to ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="accountId">Account</label>
          <select id="accountId" name="accountId" defaultValue={values.accountId ?? ""}>
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="group">Group</label>
          <select id="group" name="group" defaultValue={values.group ?? ""}>
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="categoryId">Category</label>
          <select id="categoryId" name="categoryId" defaultValue={values.categoryId ?? ""}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="payee">Payee contains</label>
          <input
            id="payee"
            name="payee"
            placeholder="Hyundai"
            defaultValue={values.payee ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="amount">Exact amount ($)</label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            placeholder="400.00"
            defaultValue={values.amount ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="amountMin">Min amount ($)</label>
          <input
            id="amountMin"
            name="amountMin"
            type="number"
            step="0.01"
            placeholder="-500"
            defaultValue={values.amountMin ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="amountMax">Max amount ($)</label>
          <input
            id="amountMax"
            name="amountMax"
            type="number"
            step="0.01"
            placeholder="-1"
            defaultValue={values.amountMax ?? ""}
          />
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button className="btn" type="submit">
            Apply filters
          </button>
          <Link className="btn secondary" href="/transactions">
            Clear
          </Link>
        </div>
      </div>
      <p className="stat muted" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
        Exact amount matches either sign (e.g. 400 finds $400.00 and −$400.00). Min/Max use the
        signed stored amount (expenses are negative).
      </p>
    </form>
  );
}
