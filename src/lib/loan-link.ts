import { AccountType } from "@prisma/client";
import { prisma } from "./db";
import { createManualTransaction } from "./accounts";

/** Principal reduction delta for a payment of `paymentAbs` cents. */
export function loanPaymentDelta(loanBalanceCents: number, paymentAbs: number): number {
  const abs = Math.abs(paymentAbs);
  // Negative balance (Chase-style debt) moves toward zero with a credit.
  // Positive balance (amount owed) decreases with a debit.
  return loanBalanceCents <= 0 ? abs : -abs;
}

/**
 * Stable substring for "Always for this payee" rules.
 * Avoids baking payment dates into the pattern (e.g. HMF … 260706 …).
 */
export function loanLinkPatternFromPayee(payee: string): string {
  const cleaned = payee.trim().toUpperCase().replace(/\s+/g, " ");
  if (!cleaned) return "";
  // Leading merchant token: letters / digits / & . '
  const token = cleaned.match(/^([A-Z][A-Z0-9&.'-]{0,24})/);
  if (token?.[1] && token[1].length >= 2) return token[1];
  return cleaned.slice(0, 24).trim();
}

/** Delete a loan mirror txn and reverse its effect on the loan balance. */
export async function deleteLoanMirror(mirrorId: string) {
  await prisma.$transaction(async (tx) => {
    const mirror = await tx.transaction.findUnique({ where: { id: mirrorId } });
    if (!mirror) return;
    await tx.transaction.updateMany({
      where: { loanMirrorId: mirrorId },
      data: { loanMirrorId: null },
    });
    await tx.transaction.delete({ where: { id: mirrorId } });
    await tx.account.update({
      where: { id: mirror.accountId },
      data: { balanceCents: { decrement: mirror.amountCents } },
    });
  });
}

/**
 * When removing checking/source txns (import undo, etc.), also remove their
 * loan mirrors so re-import + re-link does not double-count on the loan.
 */
export async function detachLoanMirrorsForTransactions(txnIds: string[]) {
  if (txnIds.length === 0) return { removed: 0 };
  const sources = await prisma.transaction.findMany({
    where: { id: { in: txnIds }, loanMirrorId: { not: null } },
    select: { id: true, loanMirrorId: true },
  });
  let removed = 0;
  for (const s of sources) {
    if (!s.loanMirrorId) continue;
    await deleteLoanMirror(s.loanMirrorId);
    removed += 1;
  }
  return { removed };
}

/** Mirrors with no source pointing at them (leftover after re-import). */
export async function cleanupOrphanLoanMirrors() {
  const mirrors = await prisma.transaction.findMany({
    where: { externalId: { startsWith: "loan-mirror-" } },
    select: { id: true, accountId: true, amountCents: true, externalId: true },
  });
  let removed = 0;
  for (const m of mirrors) {
    const linked = await prisma.transaction.findFirst({
      where: { loanMirrorId: m.id },
      select: { id: true },
    });
    if (linked) continue;
    await deleteLoanMirror(m.id);
    removed += 1;
  }
  return { removed };
}

export async function applyTxnToLoan(opts: {
  sourceTxnId: string;
  loanAccountId: string;
  always?: boolean;
  categoryId?: string;
}) {
  const source = await prisma.transaction.findUnique({
    where: { id: opts.sourceTxnId },
    include: { account: true },
  });
  if (!source) throw new Error("Transaction not found");
  if (source.loanMirrorId) throw new Error("Already linked to a loan");
  if (source.accountId === opts.loanAccountId) {
    throw new Error("Pick a different loan account");
  }
  if (source.amountCents >= 0) {
    throw new Error("Only outbound payments (negative amounts) can apply to a loan");
  }

  const loan = await prisma.account.findUnique({ where: { id: opts.loanAccountId } });
  if (!loan) throw new Error("Loan account not found");
  if (loan.type !== AccountType.LOAN && loan.type !== AccountType.CREDIT) {
    throw new Error("Target must be a LOAN or CREDIT account");
  }

  const paymentAbs = Math.abs(source.amountCents);
  const delta = loanPaymentDelta(loan.balanceCents, paymentAbs);
  const categoryId = opts.categoryId || source.categoryId || undefined;
  const externalId = `loan-mirror-${source.id}`;

  // Reuse an existing orphan mirror for the same payment (date + amount + payee).
  const dayStart = new Date(source.date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(source.date);
  dayEnd.setUTCHours(23, 59, 59, 999);
  const existingMirror = await prisma.transaction.findFirst({
    where: {
      accountId: loan.id,
      date: { gte: dayStart, lte: dayEnd },
      OR: [{ amountCents: paymentAbs }, { amountCents: -paymentAbs }],
      payee: source.payee,
      externalId: { startsWith: "loan-mirror-" },
    },
  });
  if (existingMirror) {
    const claimed = await prisma.transaction.findFirst({
      where: { loanMirrorId: existingMirror.id },
      select: { id: true },
    });
    if (!claimed) {
      await prisma.transaction.update({
        where: { id: source.id },
        data: {
          loanMirrorId: existingMirror.id,
          ...(categoryId ? { categoryId } : {}),
        },
      });
      // Normalize externalId to this source for future undo
      if (existingMirror.externalId !== externalId) {
        await prisma.transaction.update({
          where: { id: existingMirror.id },
          data: { externalId },
        });
      }
      if (opts.always) {
        await upsertLoanLinkRule(source.payee, loan.id, categoryId);
      }
      return { sourceId: source.id, mirrorId: existingMirror.id, reused: true };
    }
  }

  const mirror = await createManualTransaction({
    accountId: loan.id,
    date: source.date,
    payee: source.payee,
    memo: source.memo
      ? `${source.memo} (from ${source.account.name})`
      : `Loan payment from ${source.account.name}`,
    amountCents: delta,
    categoryId,
    externalId,
  });

  if (!mirror) throw new Error("Could not create loan mirror");

  await prisma.transaction.update({
    where: { id: source.id },
    data: {
      loanMirrorId: mirror.id,
      ...(categoryId ? { categoryId } : {}),
    },
  });

  if (opts.always) {
    await upsertLoanLinkRule(source.payee, loan.id, categoryId);
  }

  return { sourceId: source.id, mirrorId: mirror.id, reused: false };
}

async function upsertLoanLinkRule(
  payee: string,
  loanAccountId: string,
  categoryId?: string | null
) {
  const pattern = loanLinkPatternFromPayee(payee);
  if (!pattern) return;
  const existing = await prisma.loanLinkRule.findFirst({
    where: { pattern, loanAccountId },
  });
  if (!existing) {
    await prisma.loanLinkRule.create({
      data: {
        pattern,
        loanAccountId,
        categoryId: categoryId ?? null,
      },
    });
  } else if (categoryId && !existing.categoryId) {
    await prisma.loanLinkRule.update({
      where: { id: existing.id },
      data: { categoryId },
    });
  }
}

export async function matchLoanLinkRule(payee: string) {
  const hay = `${payee}`.toUpperCase();
  const rules = await prisma.loanLinkRule.findMany({
    orderBy: { pattern: "asc" },
  });
  // Prefer longest pattern match
  const matches = rules
    .filter((r) => hay.includes(r.pattern.toUpperCase()))
    .sort((a, b) => b.pattern.length - a.pattern.length);
  return matches[0] ?? null;
}

/** After importing a debit, auto-create loan mirror when a payee rule matches. */
export async function maybeAutoLinkLoan(txnId: string) {
  const txn = await prisma.transaction.findUnique({
    where: { id: txnId },
    include: { account: true },
  });
  if (!txn || txn.loanMirrorId || txn.amountCents >= 0) return null;
  if (txn.account.type === AccountType.LOAN || txn.account.type === AccountType.CREDIT) {
    return null;
  }
  const rule = await matchLoanLinkRule(txn.payee);
  if (!rule) return null;
  try {
    return await applyTxnToLoan({
      sourceTxnId: txn.id,
      loanAccountId: rule.loanAccountId,
      categoryId: rule.categoryId ?? undefined,
    });
  } catch {
    return null;
  }
}

/** Replace noisy per-payment rules with one stable pattern per loan+stem. */
export async function consolidateLoanLinkRules() {
  const rules = await prisma.loanLinkRule.findMany();
  const byKey = new Map<string, { pattern: string; loanAccountId: string; categoryId: string | null }>();
  for (const r of rules) {
    const stem = loanLinkPatternFromPayee(r.pattern) || r.pattern.slice(0, 24).toUpperCase();
    const key = `${r.loanAccountId}::${stem}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        pattern: stem,
        loanAccountId: r.loanAccountId,
        categoryId: r.categoryId,
      });
    }
  }
  await prisma.loanLinkRule.deleteMany();
  for (const row of byKey.values()) {
    await prisma.loanLinkRule.create({ data: row });
  }
  return { before: rules.length, after: byKey.size };
}
