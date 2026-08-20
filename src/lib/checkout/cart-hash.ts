import { stableStringify, sha256Hex } from "@/lib/hash-utils";
import { POLICY_VERSION } from "@/lib/policy-version";
import type { CartItem } from "@/schemas/agent";

export interface CanonicalCartInput {
  items: CartItem[];
  maxBudgetPaise?: number | null;
}

/**
 * Build the canonical cart representation:
 * - items sorted by SKU
 * - only SKU + quantity retained
 * - policy version and buyer budget folded in
 */
export function canonicalCart(input: CanonicalCartInput): Record<string, unknown> {
  const items = [...input.items]
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .map((item) => ({ sku: item.sku, quantity: item.quantity }));

  return {
    policyVersion: POLICY_VERSION,
    items,
    maxBudgetPaise: input.maxBudgetPaise ?? null,
  };
}

/**
 * SHA-256 hash of the canonical cart. Two sessions with the same hash are
 * treated as the same checkout for duplicate-order protection.
 */
export function hashCart(input: CanonicalCartInput): string {
  return sha256Hex(stableStringify(canonicalCart(input)));
}
