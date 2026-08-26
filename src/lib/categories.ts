import { prisma } from "./db";

export type CategoryInput = {
  name: string;
  group: string;
  isIncome?: boolean;
  isTransfer?: boolean;
  sortOrder?: number;
};

const PROTECTED_NAMES = new Set(["Uncategorized"]);

export async function listCategories() {
  return prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { transactions: true, rules: true, budgets: true } },
    },
  });
}

export async function getUncategorizedCategory() {
  return prisma.category.findUnique({ where: { name: "Uncategorized" } });
}

export async function createCategory(input: CategoryInput) {
  const name = input.name.trim();
  const group = input.group.trim() || "Custom";
  if (!name) throw new Error("Name required");
  if (PROTECTED_NAMES.has(name)) throw new Error("That name is reserved");

  const maxSort = await prisma.category.aggregate({ _max: { sortOrder: true } });
  const sortOrder =
    input.sortOrder ?? Math.max(100, (maxSort._max.sortOrder ?? 0) + 1);

  return prisma.category.create({
    data: {
      name,
      group,
      isIncome: Boolean(input.isIncome),
      isTransfer: Boolean(input.isTransfer),
      sortOrder,
    },
  });
}

export async function updateCategory(id: string, input: Partial<CategoryInput>) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw new Error("Category not found");

  const data: {
    name?: string;
    group?: string;
    isIncome?: boolean;
    isTransfer?: boolean;
    sortOrder?: number;
  } = {};

  if (input.name != null) {
    const name = input.name.trim();
    if (!name) throw new Error("Name required");
    if (PROTECTED_NAMES.has(existing.name) && name !== existing.name) {
      throw new Error("Uncategorized cannot be renamed");
    }
    if (PROTECTED_NAMES.has(name) && name !== existing.name) {
      throw new Error("That name is reserved");
    }
    data.name = name;
  }
  if (input.group != null) {
    data.group = input.group.trim() || existing.group;
  }
  if (input.isIncome != null) data.isIncome = Boolean(input.isIncome);
  if (input.isTransfer != null) data.isTransfer = Boolean(input.isTransfer);
  if (input.sortOrder != null && Number.isFinite(input.sortOrder)) {
    data.sortOrder = Math.trunc(input.sortOrder);
  }

  // Income and transfer are mutually exclusive for clarity
  if (data.isIncome && data.isTransfer) {
    throw new Error("A category cannot be both income and transfer");
  }
  if (data.isIncome && existing.isTransfer && input.isTransfer == null) {
    data.isTransfer = false;
  }
  if (data.isTransfer && existing.isIncome && input.isIncome == null) {
    data.isIncome = false;
  }

  return prisma.category.update({ where: { id }, data });
}

export async function deleteCategory(id: string) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw new Error("Category not found");
  if (PROTECTED_NAMES.has(existing.name)) {
    throw new Error("Uncategorized cannot be deleted");
  }

  const uncategorized = await getUncategorizedCategory();
  if (!uncategorized) {
    throw new Error("Uncategorized category missing — re-seed the database");
  }

  await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { categoryId: id },
      data: { categoryId: uncategorized.id },
    }),
    prisma.categoryRule.deleteMany({ where: { categoryId: id } }),
    prisma.budget.deleteMany({ where: { categoryId: id } }),
    prisma.category.delete({ where: { id } }),
  ]);

  return { ok: true as const };
}

const REIMBURSEMENT_NAME = "Reimbursement";

export async function ensureReimbursementCategory() {
  return prisma.category.upsert({
    where: { name: REIMBURSEMENT_NAME },
    create: {
      name: REIMBURSEMENT_NAME,
      group: "Other",
      isIncome: false,
      isTransfer: false,
      sortOrder: 90,
    },
    update: {},
  });
}

/**
 * Recategorize checking-style VENMO inflows that were Income or Uncategorized.
 * Leaves already-assigned expense categories (Dining, etc.) alone.
 */
export async function backfillVenmoReimbursements(reimbursementId?: string) {
  const reimb = reimbursementId
    ? { id: reimbursementId }
    : await ensureReimbursementCategory();
  const incomeCats = await prisma.category.findMany({
    where: { isIncome: true },
    select: { id: true },
  });
  const uncat = await getUncategorizedCategory();
  const fromIds = [...incomeCats.map((c) => c.id), uncat?.id].filter(
    (id): id is string => Boolean(id)
  );

  const result = await prisma.transaction.updateMany({
    where: {
      amountCents: { gt: 0 },
      payee: { contains: "VENMO", mode: "insensitive" },
      OR: [{ categoryId: null }, { categoryId: { in: fromIds } }],
    },
    data: { categoryId: reimb.id },
  });
  return result.count;
}

export async function ensureReimbursementSetup() {
  const cat = await ensureReimbursementCategory();
  await backfillVenmoReimbursements(cat.id);
  return cat;
}
