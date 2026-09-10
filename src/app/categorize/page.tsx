import { AppNav } from "@/components/AppNav";
import { CategorizeQueue } from "@/components/CategorizeQueue";
import { uncategorizedQueue } from "@/lib/categorize";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CategorizePage() {
  const items = await uncategorizedQueue(80);
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <main className="shell">
      <AppNav pathname="/categorize" />
      <h1>Categorize</h1>
      <p className="lede">
        Clear the queue. Use <strong>Suggest with Ollama</strong> to pre-fill categories,
        then Apply once or Always like this (creates a payee rule). Card payments and
        account moves belong under <strong>Credit Payment</strong> /{" "}
        <strong>Transfer</strong> so they don’t count as spending twice.
      </p>
      <CategorizeQueue
        categories={categories.map((c) => ({
          id: c.id,
          name: c.isTransfer ? `${c.name} (transfer)` : c.name,
        }))}
        items={items.map((t) => ({
          id: t.id,
          payee: t.payee,
          date: t.date.toISOString().slice(0, 10),
          amountCents: t.amountCents,
          accountName: t.account.name,
        }))}
      />
    </main>
  );
}