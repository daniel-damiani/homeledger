import { prisma } from "./db";

/**
 * Extract a short normalized search key from a payee for history lookup.
 * Stops at the first token that contains a digit (reference numbers, dates, IDs).
 * Returns at least 1 token, max 3 tokens, joined and uppercased.
 */
function payeeSearchKey(payee: string): string {
  const clean = payee
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = clean.split(" ");
  const words: string[] = [];
  for (const tok of tokens) {
    if (words.length > 0 && /\d/.test(tok)) break;
    if (tok.length > 1) words.push(tok);
    if (words.length >= 3) break;
  }
  return words.join(" ");
}

export async function matchCategoryId(payee: string, memo?: string): Promise<string | null> {
  const hay = `${payee} ${memo ?? ""}`.toUpperCase();

  // 1. Rule-based match (highest priority)
  const rules = await prisma.categoryRule.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  for (const rule of rules) {
    if (hay.includes(rule.pattern.toUpperCase())) {
      return rule.categoryId;
    }
  }

  // 2. History-based inference: find the most-used category for similar payees
  const searchKey = payeeSearchKey(payee);
  if (searchKey.length >= 4) {
    const uncategorizedCat = await prisma.category.findUnique({ where: { name: "Uncategorized" } });
    const excludeIds = [uncategorizedCat?.id].filter(Boolean) as string[];
    const grouped = await prisma.transaction.groupBy({
      by: ["categoryId"],
      where: {
        payee: { contains: searchKey, mode: "insensitive" },
        categoryId: { not: null, notIn: excludeIds },
      },
      _count: { categoryId: true },
      orderBy: { _count: { categoryId: "desc" } },
      take: 1,
    });
    if (grouped[0]?.categoryId) return grouped[0].categoryId;
  }

  // 3. Fall back to Uncategorized
  const uncategorized = await prisma.category.findUnique({ where: { name: "Uncategorized" } });
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