import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { createCategory, listCategories } from "@/lib/categories";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const categories = await listCategories();
  return NextResponse.json(categories);
}

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  try {
    const category = await createCategory({
      name: String(body.name || ""),
      group: String(body.group || "Custom"),
      isIncome: Boolean(body.isIncome),
      isTransfer: Boolean(body.isTransfer),
      sortOrder:
        body.sortOrder != null && body.sortOrder !== ""
          ? Number(body.sortOrder)
          : undefined,
    });
    return NextResponse.json(category);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create category";
    if (msg.includes("Unique constraint") || (e as { code?: string })?.code === "P2002") {
      return NextResponse.json(
        { error: "A category with that name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
