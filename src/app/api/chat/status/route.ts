import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getOllamaStatus } from "@/lib/ollama";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const status = await getOllamaStatus();
  return NextResponse.json(status);
}
