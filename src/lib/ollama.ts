import { buildChatTools, buildSystemPrompt, runChatTool } from "./chat-tools";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: ToolCall[];
  tool_name?: string;
};

type ToolCall = {
  type?: string;
  function: {
    name: string;
    arguments: Record<string, unknown> | string;
  };
};

function ollamaBase(): string {
  return (process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434").replace(
    /\/$/,
    ""
  );
}

function ollamaModel(): string {
  return process.env.OLLAMA_MODEL || "llama3.2";
}

export { ollamaBase, ollamaModel };

export async function getOllamaStatus(): Promise<{
  available: boolean;
  baseUrl: string;
  model: string;
  models: string[];
  error?: string;
}> {
  const baseUrl = ollamaBase();
  const model = ollamaModel();
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) {
      return {
        available: false,
        baseUrl,
        model,
        models: [],
        error: `Ollama responded ${res.status}`,
      };
    }
    const data = (await res.json()) as {
      models?: { name?: string; model?: string }[];
    };
    const models = (data.models ?? [])
      .map((m) => m.name || m.model || "")
      .filter(Boolean);
    const hasModel = models.some(
      (m) => m === model || m.startsWith(`${model}:`) || m.startsWith(model)
    );
    return {
      available: models.length > 0,
      baseUrl,
      model,
      models,
      error: hasModel
        ? undefined
        : models.length
          ? `Model “${model}” not found. Pull it or set OLLAMA_MODEL. Available: ${models.slice(0, 8).join(", ")}`
          : "No models installed in Ollama",
    };
  } catch (e) {
    return {
      available: false,
      baseUrl,
      model,
      models: [],
      error: e instanceof Error ? e.message : "Ollama unreachable",
    };
  }
}

function parseArgs(raw: Record<string, unknown> | string): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw || "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return raw ?? {};
}

async function chatOnce(
  messages: ChatMessage[],
  withTools: boolean,
  tools: ReturnType<typeof buildChatTools>
) {
  const res = await fetch(`${ollamaBase()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel(),
      stream: false,
      messages,
      ...(withTools ? { tools } : {}),
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama chat failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    message?: ChatMessage;
  };
  return data.message ?? { role: "assistant" as const, content: "" };
}

/** Agent loop: model may call tools; we execute and continue. */
export async function runAssistantChat(
  history: { role: "user" | "assistant"; content: string }[]
): Promise<{ reply: string; toolTrace: string[] }> {
  const now = new Date();
  const tools = buildChatTools(now);
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(now) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  const toolTrace: string[] = [];
  const maxRounds = 6;

  for (let i = 0; i < maxRounds; i++) {
    const msg = await chatOnce(messages, true, tools);
    const calls = msg.tool_calls ?? [];
    if (!calls.length) {
      return {
        reply: (msg.content || "").trim() || "(No response from model)",
        toolTrace,
      };
    }

    messages.push({
      role: "assistant",
      content: msg.content || "",
      tool_calls: calls,
    });

    for (const call of calls) {
      const name = call.function?.name || "unknown";
      const args = parseArgs(call.function?.arguments);
      toolTrace.push(name);
      let result: unknown;
      try {
        result = await runChatTool(name, args);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : "tool failed" };
      }
      messages.push({
        role: "tool",
        tool_name: name,
        content: JSON.stringify(result),
      });
    }
  }

  const final = await chatOnce(messages, false, tools);
  return {
    reply: (final.content || "").trim() || "I hit the tool-call limit — try a narrower question.",
    toolTrace,
  };
}
