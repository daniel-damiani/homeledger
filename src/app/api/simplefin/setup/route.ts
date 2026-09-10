import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { claimToken } from "@/lib/simplefin";

/**
 * POST /api/simplefin/setup
 * Claims a SimpleFIN token and stores the resulting Access URL in AppSettings.
 * This is a one-time operation per token.
 *
 * Token priority:
 *   1. `token` field in the JSON request body (entered via UI)
 *   2. SIMPLEFIN_TOKEN environment variable (set in .env)
 */
export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if already claimed
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (settings?.simpleFinAccessUrl) {
    return NextResponse.json({ ok: true, alreadyClaimed: true });
  }

  // Prefer body token, fall back to env
  let rawToken: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as { token?: string };
    rawToken = body.token?.trim() || process.env.SIMPLEFIN_TOKEN;
  } catch {
    rawToken = process.env.SIMPLEFIN_TOKEN;
  }

  if (!rawToken) {
    return NextResponse.json(
      { error: "No token provided. Paste your SimpleFIN token or set SIMPLEFIN_TOKEN in .env." },
      { status: 400 }
    );
  }

  try {
    const accessUrl = await claimToken(rawToken);
    await prisma.appSettings.update({
      where: { id: 1 },
      data: { simpleFinAccessUrl: accessUrl },
    });
    return NextResponse.json({ ok: true, alreadyClaimed: false });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/simplefin/setup
 * Disconnects SimpleFIN by clearing the stored Access URL.
 */
export async function DELETE() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await prisma.appSettings.update({
    where: { id: 1 },
    data: { simpleFinAccessUrl: null },
  });
  return NextResponse.json({ ok: true });
}
