"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export type CategoryRow = {
  id: string;
  name: string;
  group: string;
  isIncome: boolean;
  isTransfer: boolean;
  sortOrder: number;
  _count: { transactions: number; rules: number; budgets: number };
};

export function CategoryManager({ initial }: { initial: CategoryRow[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    group: "",
    isIncome: false,
    isTransfer: false,
    sortOrder: 100,
  });

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setSuccess("");
    setBusy(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          group: fd.get("group") || "Custom",
          isIncome: fd.get("isIncome") === "on",
          isTransfer: fd.get("isTransfer") === "on",
          sortOrder: fd.get("sortOrder"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not create category");
        return;
      }
      setSuccess(`Created “${data.name}”.`);
      form.reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function startEdit(c: CategoryRow) {
    setError("");
    setSuccess("");
    setEditingId(c.id);
    setDraft({
      name: c.name,
      group: c.group,
      isIncome: c.isIncome,
      isTransfer: c.isTransfer,
      sortOrder: c.sortOrder,
    });
  }

  async function saveEdit(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not update category");
        return;
      }
      setEditingId(null);
      setSuccess(`Updated “${data.name}”.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(c: CategoryRow) {
    if (busy) return;
    if (c.name === "Uncategorized") return;
    const ok = window.confirm(
      `Delete “${c.name}”? ${c._count.transactions} transaction(s) move to Uncategorized. Rules and budgets for this category are removed.`
    );
    if (!ok) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/categories/${c.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not delete category");
        return;
      }
      setSuccess(`Deleted “${c.name}”.`);
      if (editingId === c.id) setEditingId(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid" style={{ gap: "1rem" }}>
      <form className="panel" onSubmit={onCreate}>
        <h2>New category</h2>
        {error && !editingId ? <div className="flash error">{error}</div> : null}
        {success && !editingId ? <div className="flash">{success}</div> : null}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "0.75rem",
            alignItems: "end",
          }}
        >
          <div className="field">
            <label htmlFor="cat-name">Name</label>
            <input id="cat-name" name="name" required placeholder="Pets" disabled={busy} />
          </div>
          <div className="field">
            <label htmlFor="cat-group">Group</label>
            <input
              id="cat-group"
              name="group"
              placeholder="Custom"
              defaultValue="Custom"
              disabled={busy}
            />
          </div>
          <div className="field">
            <label htmlFor="cat-sort">Sort</label>
            <input
              id="cat-sort"
              name="sortOrder"
              type="number"
              defaultValue={100}
              disabled={busy}
            />
          </div>
          <div className="field" style={{ paddingBottom: "0.35rem" }}>
            <label>
              <input name="isIncome" type="checkbox" disabled={busy} /> Income
            </label>
          </div>
          <div className="field" style={{ paddingBottom: "0.35rem" }}>
            <label>
              <input name="isTransfer" type="checkbox" disabled={busy} /> Transfer
            </label>
          </div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Add category"}
          </button>
        </div>
      </form>

      <section className="panel">
        <h2>All categories</h2>
        {editingId && error ? <div className="flash error">{error}</div> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Group</th>
                <th>Flags</th>
                <th>Sort</th>
                <th>Used</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {initial.map((c) => {
                const protectedCat = c.name === "Uncategorized";
                const editing = editingId === c.id;
                return (
                  <tr key={c.id}>
                    <td>
                      {editing ? (
                        <input
                          value={draft.name}
                          disabled={busy || protectedCat}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, name: e.target.value }))
                          }
                        />
                      ) : (
                        c.name
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          value={draft.group}
                          disabled={busy}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, group: e.target.value }))
                          }
                        />
                      ) : (
                        c.group
                      )}
                    </td>
                    <td className="stat muted">
                      {editing ? (
                        <span style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                          <label>
                            <input
                              type="checkbox"
                              checked={draft.isIncome}
                              disabled={busy}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  isIncome: e.target.checked,
                                  isTransfer: e.target.checked ? false : d.isTransfer,
                                }))
                              }
                            />{" "}
                            Income
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={draft.isTransfer}
                              disabled={busy}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  isTransfer: e.target.checked,
                                  isIncome: e.target.checked ? false : d.isIncome,
                                }))
                              }
                            />{" "}
                            Transfer
                          </label>
                        </span>
                      ) : (
                        [
                          c.isIncome ? "income" : null,
                          c.isTransfer ? "transfer" : null,
                          !c.isIncome && !c.isTransfer ? "expense" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          type="number"
                          value={draft.sortOrder}
                          disabled={busy}
                          style={{ width: "4.5rem" }}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              sortOrder: Number(e.target.value),
                            }))
                          }
                        />
                      ) : (
                        c.sortOrder
                      )}
                    </td>
                    <td className="stat muted">
                      {c._count.transactions} txn · {c._count.rules} rules ·{" "}
                      {c._count.budgets} budgets
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                        {editing ? (
                          <>
                            <button
                              className="btn"
                              type="button"
                              disabled={busy}
                              onClick={() => void saveEdit(c.id)}
                            >
                              Save
                            </button>
                            <button
                              className="btn secondary"
                              type="button"
                              disabled={busy}
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn secondary"
                              type="button"
                              disabled={busy}
                              onClick={() => startEdit(c)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn danger"
                              type="button"
                              disabled={busy || protectedCat}
                              title={
                                protectedCat
                                  ? "Uncategorized cannot be deleted"
                                  : undefined
                              }
                              onClick={() => void onDelete(c)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
