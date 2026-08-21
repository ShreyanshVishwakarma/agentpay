import { db } from "@/lib/db";
import { createCheckoutPreview } from "@/lib/checkout/checkout-service";

/**
 * Deterministic tools an AI buyer agent may call. Every tool is plain
 * server-side code — the LLM chooses WHEN to call them, never WHAT they
 * compute. Prices, stock and eligibility always come from these functions.
 */

export interface CatalogToolItem {
  sku: string;
  name: string;
  description: string;
  pricePaise: number;
  formattedPrice: string;
  stock: number;
  purchasableByAgent: boolean;
}

export async function searchCatalog(params: {
  query?: string;
  maxPricePaise?: number;
}): Promise<{ results: CatalogToolItem[] }> {
  const items = await db.catalogItem.findMany({
    where: { active: true, paused: false, agentDiscoverable: true },
    orderBy: { pricePaise: "asc" },
  });

  const query = params.query?.toLowerCase().trim();
  const tokens = query
    ? query.split(/\s+/).filter((token) => token.length > 2)
    : [];

  const results = items
    .filter((item) => item.agentPurchasable)
    .filter((item) => params.maxPricePaise === undefined || item.pricePaise <= params.maxPricePaise)
    .filter((item) => {
      if (tokens.length === 0) return true;
      const haystack = `${item.name} ${item.description}`.toLowerCase();
      return tokens.some((token) => haystack.includes(token));
    })
    .map((item) => ({
      sku: item.sku,
      name: item.name,
      description: item.description,
      pricePaise: item.pricePaise,
      formattedPrice: `₹${(item.pricePaise / 100).toFixed(2)}`,
      stock: item.stock,
      purchasableByAgent: item.stock > 0,
    }));

  return { results };
}

export async function getProduct(params: {
  sku: string;
}): Promise<{ product: CatalogToolItem | null }> {
  const item = await db.catalogItem.findUnique({ where: { sku: params.sku } });
  if (!item || !item.active || item.paused || !item.agentDiscoverable) {
    return { product: null };
  }
  return {
    product: {
      sku: item.sku,
      name: item.name,
      description: item.description,
      pricePaise: item.pricePaise,
      formattedPrice: `₹${(item.pricePaise / 100).toFixed(2)}`,
      stock: item.stock,
      purchasableByAgent: item.agentPurchasable && item.stock > 0,
    },
  };
}

export interface ProposalToolResult {
  status: "PROPOSAL_READY" | "REJECTED";
  sessionId?: string;
  totalPaise?: number;
  formattedTotal?: string;
  rejectionCode?: string;
  message?: string;
  suggestedAction?: string;
  upsells?: Array<{
    sku: string;
    name: string;
    pricePaise: number;
    formattedPrice: string;
    kind: string;
    reason: string;
    bound: string;
  }>;
  note: string;
}

/**
 * Turns a cart into a bounded checkout proposal through the normal policy
 * pipeline. Creates an AWAITING_CONFIRMATION session — never an order.
 * Attaches policy-compliant upsell/cross-sell suggestions when merchant
 * policy allows agent recommendations.
 */
export async function proposeCheckout(params: {
  items: Array<{ sku: string; quantity: number }>;
  budgetPaise?: number;
  sourceMessage?: string;
}): Promise<ProposalToolResult> {
  const outcome = await createCheckoutPreview({
    intent: {
      items: params.items,
      maxBudgetPaise: params.budgetPaise,
      clarificationNeeded: false,
    },
    sourceMessage: params.sourceMessage,
  });

  if (outcome.kind === "rejected") {
    return {
      status: "REJECTED",
      rejectionCode: outcome.rejection.code,
      message: outcome.rejection.message,
      suggestedAction: outcome.rejection.suggestedAction,
      note: "Merchant policy blocked this cart. Do not retry the same cart.",
    };
  }

  // Growth layer: bounded recommendations, gated by merchant policy.
  const { getPolicyConfig } = await import("@/lib/checkout/policy-engine");
  const { getRecommendationsForCart } = await import("@/lib/growth/recommendations");
  const { recordAuditEvent } = await import("@/lib/audit/audit-service");

  const policy = await getPolicyConfig();
  let upsells: ProposalToolResult["upsells"] = undefined;

  if (policy.agentCanRecommend) {
    const recommendations = await getRecommendationsForCart({
      skus: outcome.items.map((item) => item.sku),
      cartTotalPaise: outcome.totalPaise,
      budgetPaise: outcome.budgetPaise,
    });
    if (recommendations.length > 0) {
      upsells = recommendations;
      await recordAuditEvent({
        sessionId: outcome.sessionId,
        eventType: "PRODUCT_RECOMMENDED",
        actor: "AGENT",
        payload: {
          recommendations: recommendations.map((rec) => ({
            sku: rec.sku,
            kind: rec.kind,
            pricePaise: rec.pricePaise,
          })),
          boundedByBudget: outcome.budgetPaise !== null,
          policyVersion: policy.policyVersion,
        },
      });
    }
  }

  return {
    status: "PROPOSAL_READY",
    sessionId: outcome.sessionId,
    totalPaise: outcome.totalPaise,
    formattedTotal: outcome.formattedTotal,
    upsells,
    note: "Proposal created. The human buyer must explicitly confirm before any payment.",
  };
}
