import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { applyTxnToLoan } from "@/lib/loan-link";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const loanAccountId = String(body.loanAccountId || "");
  if (!loanAccountId) {
    return NextResponse.json({ error: "loanAccountId required" }, { status: 400 });
  }
  try {
    const result = await applyTxnToLoan({
      sourceTxnId: id,
      loanAccountId,
      always: Boolean(body.always),
      categoryId: body.categoryId ? String(body.categoryId) : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not apply to loan";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
