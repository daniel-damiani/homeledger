/**
 * One-shot: remove orphan loan mirrors (no checking txn points at them)
 * and collapse per-payment LoanLinkRules into stable stems (e.g. HMF).
 *
 * Usage (from repo root, with DATABASE_URL pointing at Postgres):
 *   npx tsx scripts/cleanup-loan-mirrors.ts
 */
import { cleanupOrphanLoanMirrors, consolidateLoanLinkRules } from "../src/lib/loan-link";
import { prisma } from "../src/lib/db";

async function main() {
  const before = await prisma.transaction.count({
    where: { externalId: { startsWith: "loan-mirror-" } },
  });
  const orphans = await cleanupOrphanLoanMirrors();
  const rules = await consolidateLoanLinkRules();
  const after = await prisma.transaction.count({
    where: { externalId: { startsWith: "loan-mirror-" } },
  });
  const palisade = await prisma.account.findFirst({
    where: { name: { contains: "Palisade", mode: "insensitive" } },
  });
  console.log(
    JSON.stringify(
      {
        mirrorsBefore: before,
        orphansRemoved: orphans.removed,
        mirrorsAfter: after,
        rules,
        palisadeBalanceCents: palisade?.balanceCents ?? null,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
