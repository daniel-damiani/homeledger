import { AccountType, Prisma } from "@prisma/client";
import { prisma } from "./db";

export async function listAccounts(includeArchived = false) {
  return prisma.account.findMany({
    where: includeArchived ? undefined : { archived: false },
    orderBy: [{ archived: "asc" }, { name: "asc" }],
  });
}

export async function getNetWorthCents() {
  const accounts = await prisma.account.findMany({ where: { archived: false } });
  return accounts.reduce((sum, a) => {
    // Credit balances are liabilities (stored as positive owed → subtract)
    if (a.type === AccountType.CREDIT) return sum - a.balanceCents;
    return sum + a.balanceCents;
  }, 0);
}

export async function createAccount(data: {
  name: string;
  type: AccountType;
  institution?: string;
  balanceCents?: number;
  currency?: string;
}) {
  return prisma.account.create({
    data: {
      name: data.name,
      type: data.type,
      institution: data.institution,
      balanceCents: data.balanceCents ?? 0,
      currency: data.currency ?? "USD",
    },
  });
}

export async function updateAccount(
  id: string,
  data: Prisma.AccountUpdateInput
) {
  return prisma.account.update({ where: { id }, data });
}

export async function adjustBalance(accountId: string, deltaCents: number) {
  return prisma.account.update({
    where: { id: accountId },
    data: { balanceCents: { increment: deltaCents } },
  });
}

export async function createManualTransaction(input: {
  accountId: string;
  date: Date;
  payee: string;
  memo?: string;
  amountCents: number;
  categoryId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.transaction.create({
      data: {
        accountId: input.accountId,
        date: input.date,
        payee: input.payee,
        memo: input.memo,
        amountCents: input.amountCents,
        categoryId: input.categoryId,
        externalId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    });
    await tx.account.update({
      where: { id: input.accountId },
      data: { balanceCents: { increment: input.amountCents } },
    });
    return t;
  });
}