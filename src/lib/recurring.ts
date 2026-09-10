import { prisma } from "./db";
import { createManualTransaction } from "./accounts";

function clampDay(year: number, monthIndex: number, day: number): Date {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const d = Math.min(Math.max(1, day), Math.min(28, last));
  return new Date(Date.UTC(year, monthIndex, d, 12));
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Dates due on or before `through` that have not been posted yet. */
export function dueDatesForRule(
  dayOfMonth: number,
  lastPostedOn: Date | null,
  through: Date,
  createdAt: Date
): Date[] {
  const out: Date[] = [];
  const start = lastPostedOn
    ? new Date(
        Date.UTC(
          lastPostedOn.getUTCFullYear(),
          lastPostedOn.getUTCMonth() + 1,
          1,
          12
        )
      )
    : new Date(
        Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth(), 1, 12)
      );

  const notBefore = lastPostedOn
    ? lastPostedOn
    : new Date(
        Date.UTC(
          createdAt.getUTCFullYear(),
          createdAt.getUTCMonth(),
          createdAt.getUTCDate(),
          0
        )
      );

  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  const endY = through.getUTCFullYear();
  const endM = through.getUTCMonth();

  while (y < endY || (y === endY && m <= endM)) {
    const occ = clampDay(y, m, dayOfMonth);
    if (occ <= through && occ >= notBefore && (!lastPostedOn || occ > lastPostedOn)) {
      out.push(occ);
    }
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    if (out.length > 36) break;
  }
  return out;
}

export async function applyDueRecurringPayments(through = new Date()) {
  const rules = await prisma.recurringPayment.findMany({
    where: { active: true },
  });
  let posted = 0;

  for (const rule of rules) {
    const dates = dueDatesForRule(
      rule.dayOfMonth,
      rule.lastPostedOn,
      through,
      rule.createdAt
    );
    let last: Date | null = rule.lastPostedOn;
    for (const date of dates) {
      const externalBase = `recur-${rule.id}-${monthKey(date)}`;
      await createManualTransaction({
        accountId: rule.fromAccountId,
        date,
        payee: rule.payee,
        memo: rule.memo ?? rule.name,
        amountCents: -Math.abs(rule.amountCents),
        categoryId: rule.categoryId ?? undefined,
        externalId: `${externalBase}-from`,
      });
      if (rule.toAccountId) {
        await createManualTransaction({
          accountId: rule.toAccountId,
          date,
          payee: rule.payee,
          memo: rule.memo ?? `${rule.name} (principal)`,
          amountCents: -Math.abs(rule.amountCents),
          categoryId: rule.categoryId ?? undefined,
          externalId: `${externalBase}-to`,
        });
      }
      last = date;
      posted += 1;
    }
    if (last && last !== rule.lastPostedOn) {
      await prisma.recurringPayment.update({
        where: { id: rule.id },
        data: { lastPostedOn: last },
      });
    }
  }

  return { posted };
}

export async function listRecurringPayments() {
  return prisma.recurringPayment.findMany({
    include: {
      fromAccount: true,
      toAccount: true,
      category: true,
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}
