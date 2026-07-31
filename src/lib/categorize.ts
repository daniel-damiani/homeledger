import { prisma } from "./db";

export async function matchCategoryId(payee: string, memo?: string): Promise<string | null> {
  const hay = `${payee} ${memo ?? ""}`.toUpperCase();
  const rules = await prisma.categoryRule.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  for (const rule of rules) {
    if (hay.includes(rule.pattern.toUpperCase())) {
      return rule.categoryId;
    }
  }
  const uncategorized = await prisma.category.findUnique({
    where: { name: "Uncategorized" },
  });
  return uncategorized?.id ?? null;
}

export async function createRule(pattern: string, categoryId: string, priority = 50) {
  return prisma.categoryRule.create({
    data: {
      pattern: pattern.trim().toUpperCase(),
      categoryId,
      priority,
    },
  });
}

export async function uncategorizedQueue(limit = 100) {
  const uncategorized = await prisma.category.findUnique({
    where: { name: "Uncategorized" },
  });
  return prisma.transaction.findMany({
    where: {
      OR: [
        { categoryId: null },
        ...(uncategorized ? [{ categoryId: uncategorized.id }] : []),
      ],
    },
    include: { account: true, category: true },
    orderBy: { date: "desc" },
    take: limit,
  });
}