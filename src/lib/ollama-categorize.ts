import { ollamaBase, ollamaModel } from "./ollama";

export type CategoryOption = {
  id: string;
  name: string;
};

export type SuggestItem = {
  id: string;
  payee: string;
  memo?: string | null;
  amountCents: number;
};

function extractJsonObject(text: string): Record<string, string> | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, string>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, string>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Ask Ollama to map each transaction id → category name from the allowed list. */
export async function suggestCategoriesWithOllama(
  items: SuggestItem[],
  categories: CategoryOption[]
): Promise<{ suggestions: Record<string, string>; error?: string }> {
  if (items.length === 0) {
    return { suggestions: {} };
  }

  const allowed = categories.filter((c) => c.name !== "Uncategorized");
  const byName = new Map(allowed.map((c) => [normalizeName(c.name), c.id]));
  const nameList = allowed.map((c) => c.name).join(", ");

  const txnLines = items
    .map(
      (t) =>
        `- id=${t.id} | payee="${t.payee}" | memo="${t.memo ?? ""}" | amount=${(t.amountCents / 100).toFixed(2)}`
    )
    .join("\n");

  const prompt = `You categorize bank transactions for a household budget app.
Pick exactly one category name from this list for each transaction (do not invent names):
${nameList}

Rules:
- Credit card payments / account transfers → Credit Payment or Transfer if those exist.
- Grocery stores → Groceries; restaurants/coffee → Dining; gas → Gas/Transport; rent/mortgage → Housing if present.
- Paychecks / salary → Income (or similar income category).
- Respond with ONLY a JSON object mapping transaction id to category name.
Example: {"txn_abc":"Groceries","txn_def":"Dining"}

Transactions:
${txnLines}`;

  try {
    const res = await fetch(`${ollamaBase()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel(),
        stream: false,
        format: "json",
        messages: [
          {
            role: "system",
            content: "You output only valid JSON objects. No markdown.",
          },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(600_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        suggestions: {},
        error: `Ollama failed (${res.status}): ${text.slice(0, 120)}`,
      };
    }
    const data = (await res.json()) as { message?: { content?: string } };
    const parsed = extractJsonObject(data.message?.content || "");
    if (!parsed) {
      return { suggestions: {}, error: "Could not parse model response as JSON" };
    }

    const suggestions: Record<string, string> = {};
    for (const item of items) {
      const raw = parsed[item.id];
      if (typeof raw !== "string") continue;
      const id = byName.get(normalizeName(raw));
      if (id) suggestions[item.id] = id;
      else {
        // fuzzy: contain match
        for (const [name, catId] of byName) {
          if (name.includes(normalizeName(raw)) || normalizeName(raw).includes(name)) {
            suggestions[item.id] = catId;
            break;
          }
        }
      }
    }
    return { suggestions };
  } catch (e) {
    return {
      suggestions: {},
      error: e instanceof Error ? e.message : "Ollama unreachable",
    };
  }
}
