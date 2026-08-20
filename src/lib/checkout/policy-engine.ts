import { db } from "@/lib/db";
import { formatPaise } from "@/lib/money";
import type { PurchaseIntent, RejectionCode } from "@/schemas/agent";

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
}

export type PolicyResult = PolicyApproval | PolicyRejection;

export interface PolicyConfigValues {
  merchantName: string;
  maxOrderPaise: number;
  maxItemsPerOrder: number;
  confirmationRequired: boolean;
}

/** Load the singleton merchant policy row (seeded). */
export async function getPolicyConfig(): Promise<PolicyConfigValues> {
  const config = await db.policyConfig.findFirst();
  if (!config) {
    throw new Error("PolicyConfig missing — run `npx prisma db seed`.");
  }
  return {
    merchantName: config.merchantName,
    maxOrderPaise: config.maxOrderPaise,
    maxItemsPerOrder: config.maxItemsPerOrder,
    confirmationRequired: config.confirmationRequired,
  };
}

/**
 * Deterministic, server-side policy evaluation.
 *
 * The LLM never runs this code and cannot influence its inputs beyond the
 * Zod-validated intent. Every price is read from the database; nothing from
 * the request is trusted except SKUs, quantities, and an optional budget.
 */
export async function evaluatePolicy(intent: PurchaseIntent): Promise<PolicyResult> {
  const policy = await getPolicyConfig();

  // Rule: every requested SKU must exist, be active, and have stock.
  const catalogItems = await db.catalogItem.findMany({
    where: { sku: { in: intent.items.map((item) => item.sku) } },
  });
  const bySku = new Map(catalogItems.map((item) => [item.sku, item]));

  for (const requested of intent.items) {
    const item = bySku.get(requested.sku);

    if (!item) {
      return {
        ok: false,
        code: "SKU_NOT_FOUND",
        message: `We could not find an item with SKU "${requested.sku}" in the ${policy.merchantName} catalog.`,
        suggestedAction: "Pick items from the merchant catalog and try again.",
        details: { sku: requested.sku },
      };
    }

    if (!item.active) {
      return {
        ok: false,
        code: "ITEM_INACTIVE",
        message: `"${item.name}" is not available for purchase right now.`,
        suggestedAction: "Choose another item from the catalog.",
        details: { sku: requested.sku },
      };
    }

    if (item.stock < requested.quantity) {
      return {
        ok: false,
        code: "OUT_OF_STOCK",
        message:
          item.stock === 0
            ? `"${item.name}" is currently unavailable. No payment action was taken.`
            : `"${item.name}" has only ${item.stock} unit(s) left — fewer than the ${requested.quantity} you asked for. No payment action was taken.`,
        suggestedAction:
          item.stock === 0
            ? "This item is sold out. Try another item from the catalog."
            : `Reduce the quantity to ${item.stock} or less.`,
        details: { sku: requested.sku, requestedQuantity: requested.quantity, availableStock: item.stock },
      };
    }
  }

  // Rule: total units across the cart cannot exceed maxItemsPerOrder.
  const totalUnits = intent.items.reduce((sum, item) => sum + item.quantity, 0);
  if (totalUnits > policy.maxItemsPerOrder) {
    return {
      ok: false,
      code: "ITEM_LIMIT_EXCEEDED",
      message: `Your cart contains ${totalUnits} items, but orders are limited to ${policy.maxItemsPerOrder}.`,
      suggestedAction: `Reduce the cart to at most ${policy.maxItemsPerOrder} units.`,
      details: { totalUnits, maxItemsPerOrder: policy.maxItemsPerOrder },
    };
  }

  // Rule: server recalculates every line from database prices.
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

  // Rule: budget supplied by the buyer must not be exceeded.
  if (intent.maxBudgetPaise !== undefined && totalPaise > intent.maxBudgetPaise) {
    return {
      ok: false,
      code: "BUDGET_EXCEEDED",
      message: `Your cart total is ${formatPaise(totalPaise)}, which exceeds your stated ${formatPaise(intent.maxBudgetPaise)} budget.`,
      suggestedAction: "Reduce quantity or increase your approved budget.",
      details: {
        totalPaise,
        budgetPaise: intent.maxBudgetPaise,
        overByPaise: totalPaise - intent.maxBudgetPaise,
      },
    };
  }

  // Rule: total must not exceed the merchant order cap.
  if (totalPaise > policy.maxOrderPaise) {
    return {
      ok: false,
      code: "MERCHANT_ORDER_LIMIT_EXCEEDED",
      message: `Your cart total is ${formatPaise(totalPaise)}, which exceeds the ${formatPaise(policy.maxOrderPaise)} per-order limit for ${policy.merchantName}.`,
      suggestedAction: "Reduce the quantity or split your purchase into smaller orders.",
      details: { totalPaise, maxOrderPaise: policy.maxOrderPaise },
    };
  }

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

  return {
    ok: true,
    lines,
    totalPaise,
    totalUnits,
    buyerBudgetPaise: intent.maxBudgetPaise ?? null,
    maxOrderPaise: policy.maxOrderPaise,
    explanations,
  };
}
