import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface LinkBody {
  /** SimpleFIN account ID to link. */
  simpleFinId: string;
  /** If set, link to this existing HomeLedger account. */
  accountId?: string;
  /** If accountId is absent, create a new account with these properties. */
  newAccount?: {
    name: string;
    type: string;
    institution?: string;
    balanceCents?: number;
  };
}

/**
 * POST /api/simplefin/link
 * Links a SimpleFIN account ID to an existing or newly created HomeLedger account.
 */
export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as LinkBody;
  const { simpleFinId, accountId, newAccount } = body;

  if (!simpleFinId) {
    return NextResponse.json({ error: "simpleFinId required" }, { status: 400 });
  }

  let targetId: string;

  if (accountId) {
    // Link to existing account
    targetId = accountId;
  } else if (newAccount?.name) {
    // Create a new account
    const { AccountType } = await import("@prisma/client");
    const typeKey = (newAccount.type ?? "CHECKING").toUpperCase() as keyof typeof AccountType;
    const created = await prisma.account.create({
      data: {
        name: newAccount.name,
        type: AccountType[typeKey] ?? AccountType.CHECKING,
        institution: newAccount.institution,
        balanceCents: newAccount.balanceCents ?? 0,
      },
    });
    targetId = created.id;
  } else {
    return NextResponse.json(
      { error: "Either accountId or newAccount.name required" },
      { status: 400 }
    );
  }

  // Clear any existing account that was linked to this simpleFinId
  await prisma.account.updateMany({
    where: { simpleFinId, id: { not: targetId } },
    data: { simpleFinId: null, simpleFinLastSyncAt: null },
  });

  const updated = await prisma.account.update({
    where: { id: targetId },
    data: { simpleFinId },
  });

  return NextResponse.json({ ok: true, accountId: updated.id, name: updated.name });
}

/**
 * DELETE /api/simplefin/link
 * Unlinks a HomeLedger account from SimpleFIN.
 */
export async function DELETE(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { accountId } = (await req.json().catch(() => ({}))) as { accountId?: string };
  if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });

  await prisma.account.update({
    where: { id: accountId },
    data: { simpleFinId: null, simpleFinLastSyncAt: null },
  });
  return NextResponse.json({ ok: true });
}
