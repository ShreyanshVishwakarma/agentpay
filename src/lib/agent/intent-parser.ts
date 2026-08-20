import { z } from "zod";
import { env, llmConfigured } from "@/lib/env";
import { purchaseIntentSchema } from "@/schemas/agent";
import type { PurchaseIntent } from "@/schemas/agent";
import {
  FallbackParseError,
  parseWithFallback,
} from "@/lib/agent/fallback-parser";
import type { FallbackCatalogEntry } from "@/lib/agent/fallback-parser";

export type IntentParseMode = "llm" | "fallback";

export interface IntentParseResult {
  intent: PurchaseIntent;
  mode: IntentParseMode;
}

export class IntentParseError extends Error {
  readonly code: "INVALID_INTENT";

  constructor(message: string) {
    super(message);
    this.name = "IntentParseError";
    this.code = "INVALID_INTENT";
  }
}

const llmResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() }),
      }),
    )
    .min(1),
});

/**
 * System prompt for the intent extraction LLM. The model is untrusted: it
 * may only propose SKUs/quantities/budget. Everything else (pricing,
 * inventory, payment) is decided by deterministic server code.
 */
export const INTENT_SYSTEM_PROMPT = `You are an intent extraction assistant for a safe checkout system.
You do not approve purchases, calculate final prices, check inventory, create payment orders, or claim payment success.
You only extract requested merchant SKUs, quantities, and an optional maximum buyer budget.
If the request is ambiguous, set clarificationNeeded to true and ask one concise question.
Return only JSON matching the provided schema.`;

async function loadCatalogEntries(): Promise<FallbackCatalogEntry[]> {
  // Imported lazily to avoid a module-cycle between agent <-> db layers.
  const { db } = await import("@/lib/db");
  const items = await db.catalogItem.findMany({
    where: { active: true },
    select: { sku: true, name: true },
    orderBy: { sku: "asc" },
  });
  return items;
}

/**
 * Parse a natural-language buyer message into a structured intent.
 *
 * - With OPENAI_API_KEY: calls an OpenAI-compatible chat completions API and
 *   strictly validates the response against PurchaseIntentSchema. Model
 *   output can never bypass Zod parsing.
 * - Without a key (or if the call fails): uses the deterministic local
 *   fallback parser; results are reported with mode="fallback" so the UI
 *   can show the "AI fallback mode" badge.
 */
export async function parsePurchaseIntent(
  message: string,
): Promise<IntentParseResult> {
  if (llmConfigured) {
    try {
      return await parseWithLlm(message);
    } catch (error) {
      // Network errors or schema-invalid model output degrade gracefully to
      // the local parser so the demo never hard-fails on the AI step.
      console.warn(
        "[intent-parser] LLM parsing failed, using fallback:",
        error instanceof Error ? error.message : "unknown error",
      );
    }
  }
  return parseWithFallbackMode(message);
}

async function parseWithLlm(message: string): Promise<IntentParseResult> {
  const catalog = await loadCatalogEntries();
  const baseUrl = (
    process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model = env.OPENAI_MODEL || "gpt-4o-mini";

  const catalogDescription = catalog
    .map((entry) => `- sku: ${entry.sku} | name: ${entry.name}`)
    .join("\n");

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: INTENT_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            "Merchant catalog (the only valid SKUs):",
            catalogDescription,
            "",
            'JSON schema: {"items":[{"sku":string,"quantity":integer 1-5}],"maxBudgetPaise":positive integer|null,"clarificationNeeded":boolean,"clarificationQuestion":string|null}',
            "maxBudgetPaise is in paise (₹1 = 100 paise). Omit it if no budget was stated.",
            "",
            `Buyer request: ${message}`,
          ].join("\n"),
        },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`LLM API responded with status ${response.status}`);
  }

  const raw = llmResponseSchema.safeParse(await response.json());
  const content = raw.success ? raw.data.choices[0]?.message.content : null;
  if (!content) {
    throw new Error("LLM returned an empty completion");
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(content);
  } catch {
    throw new Error("LLM output was not valid JSON");
  }

  const parsed = purchaseIntentSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error("LLM output failed intent schema validation");
  }

  // Guard against hallucinated SKUs before policy runs — unknown SKUs would
  // be rejected anyway, but flagging ambiguity here gives better UX.
  const knownSkus = new Set(catalog.map((entry) => entry.sku));
  const intent = parsed.data;
  if (!intent.items.every((item) => knownSkus.has(item.sku))) {
    throw new Error("LLM proposed SKUs outside the merchant catalog");
  }

  return { intent, mode: "llm" };
}

async function parseWithFallbackMode(message: string): Promise<IntentParseResult> {
  const catalog = await loadCatalogEntries();
  try {
    const intent = parseWithFallback(message, catalog);
    return { intent, mode: "fallback" };
  } catch (error) {
    if (error instanceof FallbackParseError) {
      throw new IntentParseError(error.message);
    }
    throw error;
  }
}
