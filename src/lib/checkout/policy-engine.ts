import { db } from "@/lib/db";
import { formatPaise } from "@/lib/money";
import type { PurchaseIntent, RejectionCode } from "@/schemas/agent";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PolicyLine {
  sku: string;
  itemName: string;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
}

export interface PolicyRejection {
  ok: false;
  code: RejectionCode;
  message: string;
  suggestedAction: string;
  details: Record<string, unknown>;
}

export interface PolicyApproval {
  ok: true;
  lines: PolicyLine[];
  totalPaise: number;
  totalUnits: number;
  buyerBudgetPaise: number | null;
  maxOrderPaise: number;
  explanations: string[];
  /** High-value carts surface an extra confirmation warning in the UI. */
  requiresExtraWarning: boolean;
}

export type PolicyResult = PolicyApproval | PolicyRejection;

/** Full, versioned merchant policy values. */
export interface PolicyValues {
  policyVersion: number;
  merchantName: string;
  maxOrderPaise: number;
  maxQuantityPerItem: number;
  maxItemsPerOrder: number;
  confirmationRequired: boolean;
  allowedCurrency: string;
  sessionExpiryMinutes: number;
  defaultBuyerBudgetPaise: number | null;
  maxAgentProposedCartPaise: number;
  extraConfirmationThresholdPaise: number;
  dailyTestModeCapPaise: number;
  agentCanRecommend: boolean;
  agentCanPrepareCheckout: boolean;
  agentCanApplyBundleDiscount: boolean;
  maxAttemptsPerSession: number;
  maxCheckoutsPerCartHash: number;
  coolingOffMinutesAfterFailures: number;
  lowStockReviewThreshold: number;
  recoveryEnabled: boolean;
  maxRecoveryAttempts: number;
  changedBy: string;
}

/** Server-side catalog snapshot used by the pure evaluator. */
export interface CatalogSnapshotItem {
  sku: string;
  name: string;
  pricePaise: number;
  stock: number;
  active: boolean;
  agentDiscoverable: boolean;
  agentPurchasable: boolean;
  paused: boolean;
  maxAgentQuantity: number | null;
  availableFrom: Date | null;
  availableUntil: Date | null;
}

export interface PolicyEvaluationContext {
  policy: PolicyValues;
  catalog: CatalogSnapshotItem[];
  now: Date;
  verifiedRevenueTodayPaise: number;
}

// ---------------------------------------------------------------------------
// Defaults + legacy fallback
// ---------------------------------------------------------------------------

export const DEFAULT_POLICY_VALUES: Omit<
  PolicyValues,
  "policyVersion" | "merchantName" | "maxOrderPaise" | "maxItemsPerOrder" | "confirmationRequired"
> = {
  maxQuantityPerItem: 5,
  allowedCurrency: "INR",
  sessionExpiryMinutes: 30,
  defaultBuyerBudgetPaise: null,
  maxAgentProposedCartPaise: 200000,
  extraConfirmationThresholdPaise: 75000,
  dailyTestModeCapPaise: 500000,
  agentCanRecommend: true,
  agentCanPrepareCheckout: true,
  agentCanApplyBundleDiscount: false,
  maxAttemptsPerSession: 3,
  maxCheckoutsPerCartHash: 5,
  coolingOffMinutesAfterFailures: 10,
  lowStockReviewThreshold: 2,
  recoveryEnabled: true,
  maxRecoveryAttempts: 2,
  changedBy: "Merchant Demo Admin",
};

/**
 * Load the authoritative policy: the latest MerchantPolicy version, or a
 * legacy PolicyConfig row mapped onto the full shape (bootstrap mode).
 */
export async function getPolicyConfig(): Promise<PolicyValues> {
  const latest = await db.merchantPolicy.findFirst({
    orderBy: { policyVersion: "desc" },
  });
  if (latest) {
    return {
      policyVersion: latest.policyVersion,
      merchantName: latest.merchantName,
      maxOrderPaise: latest.maxOrderPaise,
      maxQuantityPerItem: latest.maxQuantityPerItem,
      maxItemsPerOrder: latest.maxItemsPerOrder,
      confirmationRequired: latest.confirmationRequired,
      allowedCurrency: latest.allowedCurrency,
      sessionExpiryMinutes: latest.sessionExpiryMinutes,
      defaultBuyerBudgetPaise: latest.defaultBuyerBudgetPaise,
      maxAgentProposedCartPaise: latest.maxAgentProposedCartPaise,
      extraConfirmationThresholdPaise: latest.extraConfirmationThresholdPaise,
      dailyTestModeCapPaise: latest.dailyTestModeCapPaise,
      agentCanRecommend: latest.agentCanRecommend,
      agentCanPrepareCheckout: latest.agentCanPrepareCheckout,
      agentCanApplyBundleDiscount: latest.agentCanApplyBundleDiscount,
      maxAttemptsPerSession: latest.maxAttemptsPerSession,
      maxCheckoutsPerCartHash: latest.maxCheckoutsPerCartHash,
      coolingOffMinutesAfterFailures: latest.coolingOffMinutesAfterFailures,
      lowStockReviewThreshold: latest.lowStockReviewThreshold,
      recoveryEnabled: latest.recoveryEnabled,
      maxRecoveryAttempts: latest.maxRecoveryAttempts,
      changedBy: latest.changedBy,
    };
  }

  // Legacy bootstrap: map the original singleton config onto the new shape.
  const legacy = await db.policyConfig.findFirst();
  if (!legacy) {
    throw new Error("PolicyConfig missing — run `npx prisma db seed`.");
  }
  return {
    ...DEFAULT_POLICY_VALUES,
    policyVersion: 0,
    merchantName: legacy.merchantName,
    maxOrderPaise: legacy.maxOrderPaise,
    maxItemsPerOrder: legacy.maxItemsPerOrder,
    confirmationRequired: legacy.confirmationRequired,
  };
}

async function getVerifiedRevenueTodayPaise(now: Date): Promise<number> {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const agg = await db.checkoutSession.aggregate({
    where: { status: "PAYMENT_VERIFIED", updatedAt: { gte: startOfDay } },
    _sum: { totalPaise: true },
  });
  return agg._sum.totalPaise ?? 0;
}

export async function getCatalogSnapshot(): Promise<CatalogSnapshotItem[]> {
  const items = await db.catalogItem.findMany();
  return items.map((item) => ({
    sku: item.sku,
    name: item.name,
    pricePaise: item.pricePaise,
    stock: item.stock,
    active: item.active,
    agentDiscoverable: item.agentDiscoverable,
    agentPurchasable: item.agentPurchasable,
    paused: item.paused,
    maxAgentQuantity: item.maxAgentQuantity,
    availableFrom: item.availableFrom,
    availableUntil: item.availableUntil,
  }));
}

/**
 * DB-wrapping evaluation used by preview/confirm. Loads the current policy,
 * catalog snapshot and today's verified revenue, then runs the pure rules.
 */
export async function evaluatePolicy(intent: PurchaseIntent): Promise<PolicyResult> {
  const [policy, catalog, verifiedToday] = await Promise.all([
    getPolicyConfig(),
    getCatalogSnapshot(),
    getVerifiedRevenueTodayPaise(new Date()),
  ]);
  return evaluateCartAgainstPolicy(intent, {
    policy,
    catalog,
    now: new Date(),
    verifiedRevenueTodayPaise: verifiedToday,
  });
}

// ---------------------------------------------------------------------------
// Pure deterministic evaluation — no I/O, fully unit-testable
// ---------------------------------------------------------------------------

export function evaluateCartAgainstPolicy(
  intent: PurchaseIntent,
  ctx: PolicyEvaluationContext,
): PolicyResult {
  const { policy } = ctx;
  const bySku = new Map(ctx.catalog.map((item) => [item.sku, item]));

  for (const requested of intent.items) {
    const item = bySku.get(requested.sku);

    if (!item) {
      return reject("SKU_NOT_FOUND", `We could not find an item with SKU "${requested.sku}" in the ${policy.merchantName} catalog.`, "Pick items from the merchant catalog and try again.", { sku: requested.sku });
    }
    if (!item.active) {
      return reject("ITEM_INACTIVE", `"${item.name}" is not available for purchase right now.`, "Choose another item from the catalog.", { sku: requested.sku });
    }
    if (item.paused) {
      return reject("CATALOG_ACCESS_PAUSED", `"${item.name}" is temporarily paused for AI purchases by merchant policy. No payment action was taken.`, "Try again later or choose another item.", { sku: requested.sku, control: "catalog_access.paused" });
    }
    if (!item.agentPurchasable) {
      return reject("AGENT_PURCHASE_NOT_ALLOWED", `"${item.name}" is marked human-only and cannot be purchased through an AI agent.`, "This item can be purchased directly on the merchant storefront.", { sku: requested.sku, control: "catalog_access.agent_purchasable" });
    }
    const windowCheck = checkTimeWindow(item, ctx.now);
    if (windowCheck !== null) {
      return reject("PRODUCT_OUTSIDE_WINDOW", `"${item.name}" is only available between ${windowCheck}.`, "Try again inside the availability window.", { sku: requested.sku, control: "catalog_access.time_window" });
    }
    if (item.stock < requested.quantity) {
      return reject(
        "OUT_OF_STOCK",
        item.stock === 0
          ? `"${item.name}" is currently unavailable. No payment action was taken.`
          : `"${item.name}" has only ${item.stock} unit(s) left — fewer than the ${requested.quantity} you asked for. No payment action was taken.`,
        item.stock === 0 ? "This item is sold out. Try another item from the catalog." : `Reduce the quantity to ${item.stock} or less.`,
        { sku: requested.sku, requestedQuantity: requested.quantity, availableStock: item.stock },
      );
    }

    const effectiveCap = Math.min(
      policy.maxQuantityPerItem,
      item.maxAgentQuantity ?? Number.MAX_SAFE_INTEGER,
    );
    if (requested.quantity > effectiveCap) {
      return reject(
        "AGENT_QUANTITY_CAP_EXCEEDED",
        `AI purchases of "${item.name}" are capped at ${effectiveCap} per checkout by merchant policy.`,
        `Reduce the quantity to ${effectiveCap} or less.`,
        { sku: requested.sku, requestedQuantity: requested.quantity, cap: effectiveCap, control: "catalog_access.max_agent_quantity" },
      );
    }
  }

  const totalUnits = intent.items.reduce((sum, item) => sum + item.quantity, 0);
  if (totalUnits > policy.maxItemsPerOrder) {
    return reject("ITEM_LIMIT_EXCEEDED", `Your cart contains ${totalUnits} items, but orders are limited to ${policy.maxItemsPerOrder}.`, `Reduce the cart to at most ${policy.maxItemsPerOrder} units.`, { totalUnits, maxItemsPerOrder: policy.maxItemsPerOrder, control: "transaction.max_items_per_order" });
  }

  const lines: PolicyLine[] = intent.items.map((requested) => {
    const item = bySku.get(requested.sku);
    if (!item) {
      throw new Error(`catalog item vanished during evaluation: ${requested.sku}`);
    }
    return {
      sku: item.sku,
      itemName: item.name,
      unitPricePaise: item.pricePaise,
      quantity: requested.quantity,
      lineTotalPaise: item.pricePaise * requested.quantity,
    };
  });

  const totalPaise = lines.reduce((sum, line) => sum + line.lineTotalPaise, 0);

  if (
    intent.maxBudgetPaise !== undefined &&
    totalPaise > intent.maxBudgetPaise
  ) {
    return reject("BUDGET_EXCEEDED", `Your cart total is ${formatPaise(totalPaise)}, which exceeds your stated ${formatPaise(intent.maxBudgetPaise)} budget.`, "Reduce quantity or increase your approved budget.", { totalPaise, budgetPaise: intent.maxBudgetPaise, overByPaise: totalPaise - intent.maxBudgetPaise, control: "budget.buyer_budget" });
  }

  if (totalPaise > policy.maxOrderPaise) {
    return reject("MERCHANT_ORDER_LIMIT_EXCEEDED", `Your cart total is ${formatPaise(totalPaise)}, which exceeds the ${formatPaise(policy.maxOrderPaise)} per-order limit for ${policy.merchantName}.`, "Reduce the quantity or split your purchase into smaller orders.", { totalPaise, maxOrderPaise: policy.maxOrderPaise, control: "transaction.max_order_value" });
  }

  if (totalPaise > policy.maxAgentProposedCartPaise) {
    return reject("AGENT_CART_LIMIT_EXCEEDED", `The agent-proposed cart value ${formatPaise(totalPaise)} exceeds the ${formatPaise(policy.maxAgentProposedCartPaise)} limit for AI-prepared checkouts.`, "Reduce the cart value or contact the merchant directly.", { totalPaise, maxAgentProposedCartPaise: policy.maxAgentProposedCartPaise, control: "budget.max_agent_proposed_cart" });
  }

  if (ctx.verifiedRevenueTodayPaise + totalPaise > policy.dailyTestModeCapPaise) {
    return reject("MERCHANT_DAILY_CAP_EXCEEDED", `${policy.merchantName} has reached ${formatPaise(ctx.verifiedRevenueTodayPaise)} of today's ${formatPaise(policy.dailyTestModeCapPaise)} test-mode transaction cap.`, "Try again tomorrow or contact the merchant.", { verifiedTodayPaise: ctx.verifiedRevenueTodayPaise, dailyCapPaise: policy.dailyTestModeCapPaise, control: "budget.daily_test_mode_cap" });
  }

  const requiresExtraWarning = totalPaise >= policy.extraConfirmationThresholdPaise;

  const explanations: string[] = [
    ...lines.map(
      (line) =>
        `${line.itemName} × ${line.quantity} @ ${formatPaise(line.unitPricePaise)} — inventory available`,
    ),
    intent.maxBudgetPaise !== undefined
      ? `Total ${formatPaise(totalPaise)} is within your ${formatPaise(intent.maxBudgetPaise)} budget`
      : `Total ${formatPaise(totalPaise)} is within the ${formatPaise(policy.maxOrderPaise)} merchant order limit`,
    policy.confirmationRequired
      ? "Explicit confirmation is required before checkout"
      : "Confirmation gate disabled by merchant policy",
  ];
  if (requiresExtraWarning) {
    explanations.push(
      `High-value checkout: ${formatPaise(totalPaise)} exceeds the ${formatPaise(policy.extraConfirmationThresholdPaise)} extra-confirmation threshold`,
    );
  }

  return {
    ok: true,
    lines,
    totalPaise,
    totalUnits,
    buyerBudgetPaise: intent.maxBudgetPaise ?? null,
    maxOrderPaise: policy.maxOrderPaise,
    explanations,
    requiresExtraWarning,
  };
}

function checkTimeWindow(item: CatalogSnapshotItem, now: Date): string | null {
  const from = item.availableFrom;
  const until = item.availableUntil;
  if (!from && !until) return null;
  const fmt = (date: Date) =>
    date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  if (from && now < from) return `${fmt(from)} and ${until ? fmt(until) : "open-ended"}`;
  if (until && now > until) return `${from ? fmt(from) : "now"} and ${fmt(until)}`;
  return null;
}

function reject(
  code: RejectionCode,
  message: string,
  suggestedAction: string,
  details: Record<string, unknown>,
): PolicyRejection {
  return { ok: false, code, message, suggestedAction, details };
}
