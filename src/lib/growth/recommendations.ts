import { db } from "@/lib/db";
import { formatPaise } from "@/lib/money";

/**
 * Bounded upsell & cross-sell engine (deterministic — no LLM decides offers).
 *
 * Growth rules:
 * - C1 cross-sell: interview-prep products pair with each other.
 * - U1 upsell: buyers of a cheaper pack are shown the premium pack when it
 *   is genuinely purchasable.
 * - Bounds: never exceed the buyer's stated budget, never recommend paused /
 *   human-only / out-of-stock items, max 2 suggestions, always explainable.
 */

export interface Recommendation {
  sku: string;
  name: string;
  pricePaise: number;
  formattedPrice: string;
  kind: "cross_sell" | "upsell";
  reason: string;
  bound: string;
}

const COMPLEMENTARY: Record<string, string[]> = {
  "sql-pro-pack": ["nextjs-backend-pack", "database-design-pack"],
  "nextjs-backend-pack": ["sql-pro-pack", "system-design-starter"],
  "database-design-pack": ["sql-pro-pack"],
  "system-design-starter": ["nextjs-backend-pack"],
};

export async function getRecommendationsForCart(params: {
  skus: string[];
  cartTotalPaise: number;
  budgetPaise: number | null;
  maxSuggestions?: number;
}): Promise<Recommendation[]> {
  const { skus, cartTotalPaise, budgetPaise } = params;
  const maxSuggestions = params.maxSuggestions ?? 2;

  const catalog = await db.catalogItem.findMany({
    where: {
      active: true,
      paused: false,
      agentDiscoverable: true,
      agentPurchasable: true,
      stock: { gt: 0 },
      sku: { notIn: skus.length > 0 ? skus : ["__none__"] },
    },
  });

  const bySku = new Map(catalog.map((item) => [item.sku, item]));
  const suggestions: Recommendation[] = [];

  // C1: complementary cross-sell.
  for (const sku of skus) {
    for (const candidateSku of COMPLEMENTARY[sku] ?? []) {
      if (suggestions.length >= maxSuggestions) break;
      const candidate = bySku.get(candidateSku);
      if (!candidate) continue;
      if (budgetPaise !== null && cartTotalPaise + candidate.pricePaise > budgetPaise) {
        continue;
      }
      if (suggestions.some((existing) => existing.sku === candidate.sku)) continue;

      suggestions.push({
        sku: candidate.sku,
        name: candidate.name,
        pricePaise: candidate.pricePaise,
        formattedPrice: formatPaise(candidate.pricePaise),
        kind: "cross_sell",
        reason: `Pairs with ${sku.replaceAll("-", " ")} — covers the other half of interview prep.`,
        bound:
          budgetPaise !== null
            ? `Keeps the cart within your ${formatPaise(budgetPaise)} budget`
            : "Within merchant order limits",
      });
    }
    if (suggestions.length >= maxSuggestions) break;
  }

  // U1: premium upsell — only when the buyer showed value appetite and the
  // upgrade fits inside their stated budget.
  if (suggestions.length < maxSuggestions && skus.length > 0) {
    const cheapestInCart = await db.catalogItem.findFirst({
      where: { sku: { in: skus } },
      orderBy: { pricePaise: "asc" },
    });
    const premium = catalog
      .filter(
        (item) =>
          !skus.includes(item.sku) &&
          cheapestInCart !== null &&
          item.pricePaise > cheapestInCart.pricePaise,
      )
      .sort((a, b) => a.pricePaise - b.pricePaise)[0];

    if (
      premium &&
      !suggestions.some((existing) => existing.sku === premium.sku) &&
      (budgetPaise === null || cartTotalPaise + premium.pricePaise <= budgetPaise)
    ) {
      suggestions.push({
        sku: premium.sku,
        name: premium.name,
        pricePaise: premium.pricePaise,
        formattedPrice: formatPaise(premium.pricePaise),
        kind: "upsell",
        reason: "The premium option adds advanced material on top of your pick.",
        bound: budgetPaise !== null ? `Still within your ${formatPaise(budgetPaise)} budget` : "Within merchant order limits",
      });
    }
  }

  return suggestions.slice(0, maxSuggestions);
}
