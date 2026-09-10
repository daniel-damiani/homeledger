import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getNetWorthCents, listAccounts } from "./accounts";
import { formatMonthKey, monthBounds } from "./money";

export type OllamaTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

/** Calendar facts injected so small models don't invent older years. */
export function buildDateContext(now = new Date()): {
  today: string;
  currentMonth: string;
  lastMonth: string;
  lastMonthBounds: { from: string; to: string };
} {
  const currentMonth = formatMonthKey(now);
  const lastMonth = shiftMonth(currentMonth, -1);
  const { start, end } = monthBounds(lastMonth);
  return {
    today: now.toISOString().slice(0, 10),
    currentMonth,
    lastMonth,
    lastMonthBounds: {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    },
  };
}

export function buildSystemPrompt(now = new Date()): string {
  const { today, currentMonth, lastMonth, lastMonthBounds } = buildDateContext(now);
  return `You are HomeLedger Assistant, a helpful local finance coach for this private budgeting app.
You run on the user's machine via Ollama — never suggest cloud AI services.

TODAY'S DATE CONTEXT (authoritative — never invent older years):
- Today is ${today}.
- Current calendar month is ${currentMonth}.
- "This month" means ${currentMonth}.
- "Last month" means ${lastMonth} (from ${lastMonthBounds.from} to ${lastMonthBounds.to}).
- When the user says last month / previous month / this month / yesterday, convert to these exact YYYY-MM or YYYY-MM-DD values before calling tools.
- Do NOT use years like 2023 unless the user explicitly names that year.

HomeLedger concepts:
- Accounts: CHECKING, SAVINGS, CREDIT, LOAN, CASH, INVESTMENT, OTHER.
- CREDIT/LOAN balances are liabilities (debt). Net worth subtracts |debt|.
- Transactions: expenses are negative; income positive.
- Imports: CSV/OFX/QFX with dedupe. Categorize with rules. Loan payments from checking should use Apply to loan (not double recurring).
- Budgets, goals, Tracker (monthly surplus vs savings goal), a cash Forecast, a Retire tab, and a Buy tab (house/car/cash plan) also exist in the UI.

Use tools to answer questions about THIS user's data. Prefer tools over guessing amounts.
For retirement / “am I on track to retire?”, call get_retirement_plan — never invent a success % or nest egg.
For buying a house/car or “when can I afford X?”, call get_purchase_plan — never invent a payment or date.
Be concise. Quote dollar amounts clearly. If a tool returns empty results, say so.
Do not invent account balances or transactions.`;
}

/** @deprecated Prefer buildSystemPrompt() so dates stay current. */
export const SYSTEM_PROMPT = buildSystemPrompt();

export function buildChatTools(now = new Date()): OllamaTool[] {
  const { currentMonth, lastMonth, lastMonthBounds } = buildDateContext(now);
  return [
    {
      type: "function",
      function: {
        name: "list_accounts",
        description:
          "List all non-archived accounts with type, institution, and balance in dollars. CREDIT/LOAN balances are amount owed.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function",
      function: {
        name: "get_net_worth",
        description:
          "Compute net worth in dollars: assets minus |CREDIT| and |LOAN| balances.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function",
      function: {
        name: "search_transactions",
        description: `Search transactions. Expenses are negative amounts. For "last month" use from=${lastMonthBounds.from} and to=${lastMonthBounds.to}. For "this month" use the ${currentMonth} date range.`,
        parameters: {
          type: "object",
          properties: {
            payee: {
              type: "string",
              description: "Substring match on payee (case-insensitive), e.g. Hyundai",
            },
            accountName: {
              type: "string",
              description: "Substring match on account name",
            },
            from: {
              type: "string",
              description: `Start date YYYY-MM-DD (e.g. last month starts ${lastMonthBounds.from})`,
            },
            to: {
              type: "string",
              description: `End date YYYY-MM-DD (e.g. last month ends ${lastMonthBounds.to})`,
            },
            limit: {
              type: "number",
              description: "Max rows to return (default 25, max 50)",
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "spending_by_category",
        description: `Sum expenses (negative amounts) by category for a calendar month. "Last month" = ${lastMonth}. "This month" = ${currentMonth}.`,
        parameters: {
          type: "object",
          properties: {
            month: {
              type: "string",
              description: `YYYY-MM. Examples: this month ${currentMonth}, last month ${lastMonth}. Defaults to ${currentMonth}.`,
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "list_budgets",
        description: `List budget limits and spent amounts for a month. Last month = ${lastMonth}.`,
        parameters: {
          type: "object",
          properties: {
            month: {
              type: "string",
              description: `YYYY-MM (defaults to ${currentMonth})`,
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "list_goals",
        description: "List savings goals with target and current progress.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function",
      function: {
        name: "get_retirement_plan",
        description:
          "Run HomeLedger’s local retirement engine (Monte Carlo). Returns success %, nest egg, coast-FIRE, earliest age, extra $/mo to hit 90%. Use this instead of guessing retirement numbers. Optional overrides: retireAge, extraMonthlySave (dollars), annualSpend (dollars), ssClaimAge (62–70).",
        parameters: {
          type: "object",
          properties: {
            retireAge: { type: "number", description: "Target retirement age override" },
            extraMonthlySave: {
              type: "number",
              description: "Extra monthly savings in dollars on top of the ledger rate",
            },
            annualSpend: {
              type: "number",
              description: "Desired annual retirement spend in dollars",
            },
            ssClaimAge: {
              type: "number",
              description: "Social Security claiming age 62–70",
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_purchase_plan",
        description:
          "Run HomeLedger’s local house/car/cash purchase planner. Returns payment, cash to close, months to save, DTI. Use instead of guessing. Optional kind: HOUSE, CAR, or CASH.",
        parameters: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["HOUSE", "CAR", "CASH"],
              description: "Purchase type override",
            },
            extraMonthlySave: {
              type: "number",
              description: "Monthly dollars planned toward the purchase (not added on top of surplus)",
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "app_help",
        description:
          "Explain how HomeLedger features work (import, categorize, loans, budgets, tracker, etc.).",
        parameters: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              description:
                "Optional focus: import, categorize, loans, budgets, recurring, net_worth, transactions, tracker, retire, buy",
            },
          },
          additionalProperties: false,
        },
      },
    },
  ];
}

export const CHAT_TOOLS: OllamaTool[] = buildChatTools();

function dollars(cents: number): number {
  return Math.round(cents) / 100;
}

function helpText(topic?: string): string {
  const all: Record<string, string> = {
    overview:
      "HomeLedger is a private single-user budgeting app. Data lives in local Postgres via Docker. Unlock with a PIN. No cloud finance APIs.",
    import:
      "Import CSV/OFX/QFX on Import. Presets include chase, chase-credit, citi-savings. Duplicates skip via (accountId, externalId). Prefer CSV when available; Principal 401k uses QFX investment format.",
    categorize:
      "Uncategorized queue on Categorize. Suggest with Ollama pre-fills categories; Apply once or Always like this (creates a payee rule). Credit card payments should use Credit Payment (transfer) so spending is not double-counted.",
    loans:
      "Create a LOAN account (balance = amount owed). Import checking CSVs for bank debits. On Transactions, use Apply to loan on a payment — optionally Always for this payee. Do not also recurring-debit checking for the same payment.",
    budgets:
      "Budgets page: set a category limit for a month; checkbox applies through December. Copy previous month available.",
    recurring:
      "Recurring autopay on Accounts posts fixed monthly amounts. Prefer loan-only recurring if checking already imports the payment.",
    net_worth:
      "Net worth = checking/savings/cash/investment balances minus absolute CREDIT and LOAN balances (debt).",
    transactions:
      "Transactions tab filters by date, account, payee, amount. Apply to loan lives there.",
    tracker:
      "Tracker shows monthly surplus (income − spending, transfers excluded) vs the monthly savings goal set on Goals, plus category/account breakdowns.",
    retire:
      "Retire tab prefills nest egg, spend, and saving from the ledger and runs a local Monte Carlo. Chat can call get_retirement_plan for the same numbers.",
    buy:
      "Buy tab plans a house, car, or cash goal from ledger income, spend, and liquid cash. Other cash (home-sale proceeds, gifts) can be typed in because HomeLedger does not know home equity. You can shorten the lookback (e.g. 3 months) if imports do not go back a year. Chat can call get_purchase_plan.",
  };
  if (!topic) return Object.values(all).join("\n\n");
  const key = topic.toLowerCase().replace(/\s+/g, "_");
  return all[key] || Object.values(all).join("\n\n");
}

export async function runChatTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "list_accounts": {
      const accounts = await listAccounts(false);
      return accounts.map((a) => ({
        name: a.name,
        type: a.type,
        institution: a.institution,
        balance: dollars(a.balanceCents),
        currency: a.currency,
      }));
    }
    case "get_net_worth": {
      const net = await getNetWorthCents();
      return { netWorth: dollars(net), currency: "USD" };
    }
    case "search_transactions": {
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 25));
      const where: Prisma.TransactionWhereInput = {};
      if (typeof args.payee === "string" && args.payee.trim()) {
        where.payee = { contains: args.payee.trim(), mode: "insensitive" };
      }
      if (typeof args.accountName === "string" && args.accountName.trim()) {
        where.account = {
          name: { contains: args.accountName.trim(), mode: "insensitive" },
        };
      }
      if (args.from || args.to) {
        where.date = {};
        if (typeof args.from === "string") {
          where.date.gte = new Date(`${args.from}T00:00:00.000Z`);
        }
        if (typeof args.to === "string") {
          where.date.lte = new Date(`${args.to}T23:59:59.999Z`);
        }
      }
      const rows = await prisma.transaction.findMany({
        where,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: limit,
        include: { account: true, category: true },
      });
      return rows.map((t) => ({
        date: t.date.toISOString().slice(0, 10),
        account: t.account.name,
        payee: t.payee,
        category: t.category?.name ?? null,
        amount: dollars(t.amountCents),
        linkedToLoan: Boolean(t.loanMirrorId),
      }));
    }
    case "spending_by_category": {
      const month =
        typeof args.month === "string" && /^\d{4}-\d{2}$/.test(args.month)
          ? args.month
          : formatMonthKey();
      const { start, end } = monthBounds(month);
      const txns = await prisma.transaction.findMany({
        where: {
          date: { gte: start, lte: end },
          amountCents: { lt: 0 },
        },
        include: { category: true },
      });
      const map = new Map<string, number>();
      for (const t of txns) {
        const cat = t.category?.name ?? "Uncategorized";
        map.set(cat, (map.get(cat) ?? 0) + Math.abs(t.amountCents));
      }
      return {
        month,
        categories: [...map.entries()]
          .map(([category, cents]) => ({ category, spent: dollars(cents) }))
          .sort((a, b) => b.spent - a.spent),
      };
    }
    case "list_budgets": {
      const month =
        typeof args.month === "string" && /^\d{4}-\d{2}$/.test(args.month)
          ? args.month
          : formatMonthKey();
      const { start, end } = monthBounds(month);
      const budgets = await prisma.budget.findMany({
        where: { month },
        include: { category: true },
      });
      const out = [];
      for (const b of budgets) {
        const spentAgg = await prisma.transaction.aggregate({
          where: {
            categoryId: b.categoryId,
            date: { gte: start, lte: end },
            amountCents: { lt: 0 },
          },
          _sum: { amountCents: true },
        });
        const spent = Math.abs(spentAgg._sum.amountCents ?? 0);
        out.push({
          category: b.category.name,
          limit: dollars(b.limitCents),
          spent: dollars(spent),
          remaining: dollars(b.limitCents - spent),
        });
      }
      return { month, budgets: out };
    }
    case "list_goals": {
      const goals = await prisma.goal.findMany({ orderBy: { name: "asc" } });
      return goals.map((g) => ({
        name: g.name,
        status: g.status,
        target: dollars(g.targetCents),
        current: dollars(g.currentCents),
        targetDate: g.targetDate?.toISOString().slice(0, 10) ?? null,
      }));
    }
    case "app_help": {
      return {
        help: helpText(typeof args.topic === "string" ? args.topic : undefined),
      };
    }
    case "get_retirement_plan": {
      const { compactAdvicePayload, computeRetirementPlan } = await import("./retirement");
      const overrides: {
        retireAge?: number;
        extraMonthlySaveCents?: number;
        annualSpendCents?: number;
        ssClaimAge?: number;
      } = {};
      if (typeof args.retireAge === "number") overrides.retireAge = args.retireAge;
      if (typeof args.extraMonthlySave === "number") {
        overrides.extraMonthlySaveCents = Math.round(args.extraMonthlySave * 100);
      }
      if (typeof args.annualSpend === "number") {
        overrides.annualSpendCents = Math.round(args.annualSpend * 100);
      }
      if (typeof args.ssClaimAge === "number") overrides.ssClaimAge = args.ssClaimAge;
      const out = await computeRetirementPlan(overrides);
      if (!out.result) {
        return { error: out.error || "Set a birth year on the Retire tab first." };
      }
      return compactAdvicePayload(out.result);
    }
    case "get_purchase_plan": {
      const { compactPurchaseAdvice, computePurchasePlan, isPurchaseKind } = await import(
        "./purchase"
      );
      const overrides: { kind?: "HOUSE" | "CAR" | "CASH"; plannedMonthlySaveCents?: number } = {};
      if (isPurchaseKind(args.kind)) overrides.kind = args.kind;
      if (typeof args.extraMonthlySave === "number") {
        overrides.plannedMonthlySaveCents = Math.round(args.extraMonthlySave * 100);
      }
      const out = await computePurchasePlan(overrides);
      return compactPurchaseAdvice(out.result);
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
