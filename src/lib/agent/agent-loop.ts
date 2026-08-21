import { z } from "zod";
import { env, llmConfigured } from "@/lib/env";
import { getProduct, proposeCheckout, searchCatalog } from "@/lib/agent/tools";
import type { ProposalToolResult } from "@/lib/agent/tools";

/**
 * The buying agent loop.
 *
 * This is the piece that makes an LLM an actual buyer: it drives a
 * tool-calling loop against merchant APIs — search the catalog, inspect
 * products, build a cart, request a bounded checkout proposal. The loop can
 * pick products and construct carts autonomously; it can NEVER create a
 * payment order. The human confirms. When no LLM key is configured, a
 * deterministic planner drives the same tools so the demo always works.
 */

export interface AgentTraceStep {
  tool: string;
  args: Record<string, unknown>;
  resultSummary: string;
}

export interface UpsellSuggestion {
  sku: string;
  name: string;
  pricePaise: number;
  formattedPrice: string;
  kind: string;
  reason: string;
  bound: string;
}

export type AgentOutcome =
  | {
      type: "proposal";
      sessionId: string;
      totalPaise: number;
      formattedTotal: string;
      upsells?: UpsellSuggestion[];
    }
  | { type: "rejection"; code: string; message: string }
  | { type: "clarification"; question: string };

export interface AgentRunResult {
  mode: "llm" | "fallback";
  trace: AgentTraceStep[];
  outcome: AgentOutcome;
}

const MAX_ITERATIONS = 6;

const toolCallSchema = z.object({
  items: z
    .array(z.object({ sku: z.string().min(1), quantity: z.number().int().min(1).max(5) }))
    .min(1)
    .max(5),
  budgetPaise: z.number().int().positive().optional(),
});

const AGENT_SYSTEM_PROMPT = `You are an autonomous buying agent acting for a human principal on AgentPay.
You MUST use tools to discover products and prices — never invent SKUs, prices, or stock.
Workflow:
1. Call search_catalog with keywords from the buyer's request (and maxPricePaise if they stated a budget).
2. Optionally call get_product to inspect a candidate.
3. Call propose_checkout with 1-5 items (quantity 1-5 each) and their budget in paise.
Rules:
- If the request is too vague to search (no product idea at all), reply with ONE concise clarifying question instead of calling tools.
- If propose_checkout returns REJECTED, do not retry the same cart; either adjust within the buyer's stated constraints or explain the rejection.
- After a successful propose_checkout, reply with a one-sentence summary of the proposal.
You cannot pay, confirm, or promise payment. The human explicitly confirms any checkout.`;

interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "search_catalog",
      description: "Search the merchant catalog. Returns SKUs, names, prices (paise), stock.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Space-separated keywords" },
          maxPricePaise: { type: "integer", description: "Optional max unit price in paise" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product",
      description: "Get one product by exact SKU.",
      parameters: {
        type: "object",
        properties: { sku: { type: "string" } },
        required: ["sku"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_checkout",
      description:
        "Create a bounded checkout proposal for the human to confirm. Prices/eligibility are computed server-side.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: {
              type: "object",
              properties: {
                sku: { type: "string" },
                quantity: { type: "integer", minimum: 1, maximum: 5 },
              },
              required: ["sku", "quantity"],
            },
          },
          budgetPaise: { type: "integer", description: "Buyer's max total budget in paise" },
        },
        required: ["items"],
      },
    },
  },
] as const;

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  trace: AgentTraceStep[],
  sourceMessage: string,
): Promise<unknown> {
  switch (name) {
    case "search_catalog": {
      const result = await searchCatalog({
        query: typeof args.query === "string" ? args.query : undefined,
        maxPricePaise:
          typeof args.maxPricePaise === "number" ? args.maxPricePaise : undefined,
      });
      trace.push({
        tool: "search_catalog",
        args: args,
        resultSummary: `${result.results.length} product(s): ${result.results
          .map((item) => `${item.sku} ${item.formattedPrice}`)
          .join(", ") || "none"}`,
      });
      return result;
    }
    case "get_product": {
      const result = await getProduct({ sku: String(args.sku ?? "") });
      trace.push({
        tool: "get_product",
        args: args,
        resultSummary: result.product
          ? `${result.product.name} @ ${result.product.formattedPrice}`
          : "not found",
      });
      return result;
    }
    case "propose_checkout": {
      const parsed = toolCallSchema.shape.items.safeParse(args.items);
      if (!parsed.success) {
        return { status: "REJECTED", rejectionCode: "INVALID_INTENT", note: "Malformed cart." };
      }
      const result = await proposeCheckout({
        items: parsed.data,
        budgetPaise: typeof args.budgetPaise === "number" ? args.budgetPaise : undefined,
        sourceMessage,
      });
      trace.push({
        tool: "propose_checkout",
        args: args,
        resultSummary:
          result.status === "PROPOSAL_READY"
            ? `proposal ${result.formattedTotal} awaiting confirmation`
            : `${result.rejectionCode}: ${result.message ?? ""}`,
      });
      return result;
    }
    default:
      return { error: `unknown tool ${name}` };
  }
}

/** Entry point: run the buying agent for one buyer message. */
export async function runBuyingAgent(message: string): Promise<AgentRunResult> {
  if (llmConfigured) {
    try {
      return await runWithLlm(message);
    } catch (error) {
      console.warn(
        "[agent-loop] LLM loop failed, using deterministic planner:",
        error instanceof Error ? error.message : "unknown",
      );
    }
  }
  return runWithPlanner(message);
}

async function runWithLlm(message: string): Promise<AgentRunResult> {
  const trace: AgentTraceStep[] = [];
  const messages: LlmMessage[] = [
    { role: "system", content: AGENT_SYSTEM_PROMPT },
    { role: "user", content: message },
  ];

  let proposal: ProposalToolResult | null = null;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await fetch(
      `${(process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || "gpt-4o-mini",
          temperature: 0,
          messages,
          tools: TOOL_DEFINITIONS,
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) throw new Error(`LLM API status ${response.status}`);

    const payload = (await response.json()) as {
      choices?: Array<{ message?: LlmMessage }>;
    };
    const assistant = payload.choices?.[0]?.message;
    if (!assistant) throw new Error("empty completion");

    if (assistant.tool_calls && assistant.tool_calls.length > 0) {
      messages.push({ role: "assistant", content: assistant.content, tool_calls: assistant.tool_calls });
      for (const call of assistant.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments) as Record<string, unknown>;
        } catch {
          args = {};
        }
        const result = await executeTool(call.function.name, args, trace, message);
        if (call.function.name === "propose_checkout") {
          const maybe = result as ProposalToolResult;
          if (maybe.status === "PROPOSAL_READY") proposal = maybe;
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    // Final text answer.
    if (proposal?.status === "PROPOSAL_READY" && proposal.sessionId) {
      return {
        mode: "llm",
        trace,
        outcome: {
          type: "proposal",
          sessionId: proposal.sessionId,
          totalPaise: proposal.totalPaise ?? 0,
          formattedTotal: proposal.formattedTotal ?? "",
          upsells: proposal.upsells,
        },
      };
    }
    return {
      mode: "llm",
      trace,
      outcome: { type: "clarification", question: assistant.content ?? "Could you restate your request?" },
    };
  }

  if (proposal?.status === "PROPOSAL_READY" && proposal.sessionId) {
    return {
      mode: "llm",
      trace,
      outcome: {
        type: "proposal",
        sessionId: proposal.sessionId,
        totalPaise: proposal.totalPaise ?? 0,
        formattedTotal: proposal.formattedTotal ?? "",
        upsells: proposal.upsells,
      },
    };
  }
  return {
    mode: "llm",
    trace,
    outcome: { type: "clarification", question: "I couldn't complete that in time — please rephrase." },
  };
}

// ---------------------------------------------------------------------------
// Deterministic fallback planner (no API key needed) — same tools, scripted.
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, single: 1, two: 2, pair: 2, three: 3, four: 4, five: 5,
};

async function runWithPlanner(message: string): Promise<AgentRunResult> {
  const trace: AgentTraceStep[] = [];
  const lower = message.toLowerCase();

  const budgetMatch = lower.match(
    /(?:under|below|less than|max(?:imum)?|upto|up to|within|budget(?: of)?)\s*(?:₹|rs\.?|inr\.?)?\s*([\d][\d,]*(?:\.\d+)?)/,
  );
  const budgetPaise = budgetMatch
    ? Math.round(Number.parseFloat(budgetMatch[1].replace(/,/g, "")) * 100)
    : undefined;

  const tokens = lower.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const quantity = (() => {
    for (const token of tokens) {
      const numeric = Number.parseInt(token, 10);
      if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 5) return numeric;
      if (NUMBER_WORDS[token]) return NUMBER_WORDS[token];
    }
    return 1;
  })();

  // Step 1: search the catalog (same tool the LLM uses) — by meaning, not
  // price, so the buyer sees what exists.
  const search = await searchCatalog({ query: lower });
  trace.push({
    tool: "search_catalog",
    args: { query: lower },
    resultSummary: `${search.results.length} product(s): ${search.results
      .map((item) => item.sku)
      .join(", ") || "none"}`,
  });

  if (search.results.length === 0) {
    return {
      mode: "fallback",
      trace,
      outcome: {
        type: "clarification",
        question:
          'I couldn\'t match that to catalog products. Try naming one, e.g. "find me something under ₹500 for SQL interview prep".',
      },
    };
  }

  // Step 2: rank by keyword overlap; prefer the best match within budget,
  // but if nothing fits, still propose the best match and let the
  // deterministic policy engine deliver the verdict.
  const ranked = [...search.results].sort((a, b) => {
    const scoreOf = (item: { name: string; description: string }) =>
      tokens.filter((token) =>
        `${item.name} ${item.description}`.toLowerCase().includes(token),
      ).length;
    return scoreOf(b) - scoreOf(a) || a.pricePaise - b.pricePaise;
  });
  const withinBudget =
    budgetPaise !== undefined
      ? ranked.filter((item) => item.pricePaise <= budgetPaise)
      : [];
  const chosen = withinBudget[0] ?? ranked[0]!;

  // Step 3: propose the cart through the policy pipeline.
  const result = await proposeCheckout({
    items: [{ sku: chosen.sku, quantity }],
    budgetPaise,
    sourceMessage: message,
  });
  trace.push({
    tool: "propose_checkout",
    args: { items: [{ sku: chosen.sku, quantity }], budgetPaise: budgetPaise ?? null },
    resultSummary:
      result.status === "PROPOSAL_READY"
        ? `proposal ${result.formattedTotal} awaiting confirmation`
        : `${result.rejectionCode}: ${result.message ?? ""}`,
  });

  if (result.status === "PROPOSAL_READY" && result.sessionId) {
    return {
      mode: "fallback",
      trace,
      outcome: {
        type: "proposal",
        sessionId: result.sessionId,
        totalPaise: result.totalPaise ?? 0,
        formattedTotal: result.formattedTotal ?? "",
        upsells: result.upsells,
      },
    };
  }

  return {
    mode: "fallback",
    trace,
    outcome: {
      type: "rejection",
      code: result.rejectionCode ?? "INVALID_INTENT",
      message: result.message ?? "The cart was rejected by merchant policy.",
    },
  };
}
