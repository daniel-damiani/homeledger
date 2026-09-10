import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { deleteCategory, updateCategory } from "@/lib/categories";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  try {
    const category = await updateCategory(id, {
      name: body.name != null ? String(body.name) : undefined,
      group: body.group != null ? String(body.group) : undefined,
      isIncome: body.isIncome != null ? Boolean(body.isIncome) : undefined,
      isTransfer: body.isTransfer != null ? Boolean(body.isTransfer) : undefined,
      sortOrder:
        body.sortOrder != null && body.sortOrder !== ""
          ? Number(body.sortOrder)
          : undefined,
    });
    return NextResponse.json(category);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not update category";
    if (msg.includes("not found")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (String(e).includes("Unique constraint")) {
      return NextResponse.json(
        { error: "A category with that name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    await deleteCategory(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not delete category";
    if (msg.includes("not found")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
