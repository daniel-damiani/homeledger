import { Prisma } from "@prisma/client";
import { AppNav } from "@/components/AppNav";
import { BulkCategorizeBar } from "@/components/BulkCategorizeBar";
import { TransactionsFilterForm } from "@/components/TransactionsFilterForm";
import { TransactionsTable } from "@/components/TransactionsTable";
import { listAccounts } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { dollarsToCents } from "@/lib/money";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

function parseAmount(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return dollarsToCents(n);
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    accountId?: string;
    payee?: string;
    amount?: string;
    amountMin?: string;
    amountMax?: string;
    categoryId?: string;
    group?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const accounts = await listAccounts(true);
  const active = accounts.filter((a) => !a.archived);
  const loanAccounts = active.filter((a) => a.type === "LOAN" || a.type === "CREDIT");

  const allCategories = await prisma.category.findMany({
    orderBy: [{ group: "asc" }, { name: "asc" }],
  });
  const groups = [...new Set(allCategories.map((c) => c.group))].sort();

  // When a group filter is active, restrict the category dropdown to that group
  const visibleCategories =
    sp.group ? allCategories.filter((c) => c.group === sp.group) : allCategories;

  const page = Math.max(1, Number.parseInt(sp.page || "1", 10) || 1);
  const where: Prisma.TransactionWhereInput = {};

  if (sp.accountId) where.accountId = sp.accountId;

  if (sp.from || sp.to) {
    where.date = {};
    if (sp.from) where.date.gte = new Date(`${sp.from}T00:00:00.000Z`);
    if (sp.to) where.date.lte = new Date(`${sp.to}T23:59:59.999Z`);
  }

  if (sp.payee?.trim()) {
    where.payee = { contains: sp.payee.trim(), mode: "insensitive" };
  }

  if (sp.categoryId) {
    where.categoryId = sp.categoryId;
  } else if (sp.group) {
    // Filter by all categories in the selected group
    const groupCatIds = allCategories
      .filter((c) => c.group === sp.group)
      .map((c) => c.id);
    where.categoryId = { in: groupCatIds };
  }

  const exact = parseAmount(sp.amount);
  const min = parseAmount(sp.amountMin);
  const max = parseAmount(sp.amountMax);

  if (exact != null) {
    where.OR = [{ amountCents: exact }, { amountCents: -exact }];
  } else if (min != null || max != null) {
    where.amountCents = {};
    if (min != null) where.amountCents.gte = min;
    if (max != null) where.amountCents.lte = max;
  }

  const [total, rows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { account: true, category: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v && k !== "page") qs.set(k, v);
  }
  const baseQs = qs.toString();
  const pageHref = (p: number) =>
    `/transactions?${baseQs}${baseQs ? "&" : ""}page=${p}`;

  return (
    <main className="shell shell-wide">
      <AppNav pathname="/transactions" />
      <h1>Transactions</h1>
      <p className="lede">
        Search across imports and manual entries. Change a category inline. Use{" "}
        <strong>Apply to loan</strong> on a checking debit to reduce a LOAN balance without
        double-counting.
      </p>

      <div style={{ marginBottom: "1rem" }}>
        <TransactionsFilterForm
          accounts={active.map((a) => ({ id: a.id, name: a.name }))}
          categories={visibleCategories.map((c) => ({ id: c.id, name: c.name, group: c.group }))}
          groups={groups}
          values={{
            from: sp.from,
            to: sp.to,
            accountId: sp.accountId,
            payee: sp.payee,
            amount: sp.amount,
            amountMin: sp.amountMin,
            amountMax: sp.amountMax,
            categoryId: sp.categoryId,
            group: sp.group,
          }}
        />
      </div>

      <section className="panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            marginBottom: "0.75rem",
          }}
        >
          <h2 style={{ margin: 0 }}>
            Results · {total} match{total === 1 ? "" : "es"}
            {total > PAGE_SIZE ? ` · page ${page}/${totalPages}` : ""}
          </h2>
        </div>
        <BulkCategorizeBar
          txnIds={rows.map((t) => t.id)}
          categories={allCategories.map((c) => ({ id: c.id, name: c.name }))}
          totalMatches={total}
          pageSize={PAGE_SIZE}
        />
        <TransactionsTable
          loanAccounts={loanAccounts.map((a) => ({ id: a.id, name: a.name }))}
          categories={allCategories.map((c) => ({ id: c.id, name: c.name }))}
          rows={rows.map((t) => ({
            id: t.id,
            date: t.date.toISOString().slice(0, 10),
            accountName: t.account.name,
            accountType: t.account.type,
            payee: t.payee,
            categoryId: t.category?.id ?? null,
            categoryName: t.category?.name ?? null,
            amountCents: t.amountCents,
            loanMirrorId: t.loanMirrorId,
          }))}
        />
        {totalPages > 1 ? (
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              marginTop: "1rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {page > 1 ? (
              <a className="btn secondary" href={pageHref(page - 1)}>
                Previous
              </a>
            ) : null}
            <span className="stat muted">
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <a className="btn secondary" href={pageHref(page + 1)}>
                Next
              </a>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
