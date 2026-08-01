import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getOllamaStatus, runAssistantChat } from "@/lib/ollama";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getOllamaStatus();
  if (!status.available) {
    return NextResponse.json(
      {
        error:
          status.error ||
          "Ollama is not reachable. Start Ollama on the host and ensure OLLAMA_BASE_URL is set.",
      },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const cleaned = messages
    .filter(
      (m: { role?: string; content?: string }) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .map((m: { role: "user" | "assistant"; content: string }) => ({
      role: m.role,
      content: m.content.trim().slice(0, 8000),
    }))
    .slice(-20);

  if (!cleaned.length || cleaned[cleaned.length - 1].role !== "user") {
    return NextResponse.json({ error: "Send a user message" }, { status: 400 });
  }

  try {
    const result = await runAssistantChat(cleaned);
    return NextResponse.json({
      reply: result.reply,
      toolTrace: result.toolTrace,
      model: status.model,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Chat failed" },
      { status: 502 }
    );
  }
}
