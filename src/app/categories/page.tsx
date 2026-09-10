import { AppNav } from "@/components/AppNav";
import { CategoryManager } from "@/components/CategoryManager";
import { listCategories } from "@/lib/categories";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const categories = await listCategories();

  return (
    <main className="shell">
      <AppNav pathname="/categories" />
      <h1>Categories</h1>
      <p className="lede">
        Add spending buckets, mark income or transfers, and clean up unused ones.
        Deleting a category moves its transactions to Uncategorized.
      </p>
      <CategoryManager
        initial={categories.map((c) => ({
          id: c.id,
          name: c.name,
          group: c.group,
          isIncome: c.isIncome,
          isTransfer: c.isTransfer,
          sortOrder: c.sortOrder,
          _count: c._count,
        }))}
      />
    </main>
  );
}
