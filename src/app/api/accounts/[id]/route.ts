import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { deleteAccount } from "@/lib/accounts";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    await deleteAccount(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
}