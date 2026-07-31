import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { undoImportBatch } from "@/lib/import/commit";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const batch = await undoImportBatch(id);
  if (!batch) return NextResponse.json({ error: "Not found or already undone" }, { status: 404 });
  return NextResponse.json({ ok: true });
}