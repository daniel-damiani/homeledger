import { AppNav } from "@/components/AppNav";
import { CategorizeQueue } from "@/components/CategorizeQueue";
import { uncategorizedQueue } from "@/lib/categorize";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CategorizePage() {
  const items = await uncategorizedQueue(80);
  const categories = await prisma.category.findMany({
    where: { isTransfer: false },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <main className="shell">
      <AppNav pathname="/categorize" />
      <h1>Categorize</h1>
      <p className="lede">Clear the queue. “Always like this” creates a payee rule.</p>
      <CategorizeQueue
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
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