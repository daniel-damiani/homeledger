import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOllamaStatus } from "@/lib/ollama";
import { suggestCategoriesWithOllama } from "@/lib/ollama-categorize";

export const maxDuration = 600;

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getOllamaStatus();
  if (!status.available) {
    return NextResponse.json(
      { error: status.error || "Ollama is not available" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.txnIds)
    ? body.txnIds.map((id: unknown) => String(id)).filter(Boolean).slice(0, 40)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "txnIds required" }, { status: 400 });
  }

  const [txns, categories] = await Promise.all([
    prisma.transaction.findMany({
      where: { id: { in: ids } },
      select: { id: true, payee: true, memo: true, amountCents: true },
    }),
    prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  const { suggestions, error } = await suggestCategoriesWithOllama(txns, categories);
  if (error && Object.keys(suggestions).length === 0) {
    return NextResponse.json({ error, suggestions: {} }, { status: 502 });
  }

  return NextResponse.json({ suggestions, warning: error });
}
