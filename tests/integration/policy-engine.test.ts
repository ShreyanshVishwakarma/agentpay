import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { evaluatePolicy } from "@/lib/checkout/policy-engine";
import { purchaseIntentSchema } from "@/schemas/agent";
import { resetStock, seedTestData } from "../helpers/db";

beforeAll(async () => {
  await seedTestData();
});

beforeEach(async () => {
  await resetStock();
});

describe("evaluatePolicy — approvals", () => {
  it("recalculates totals exclusively from database prices", async () => {
    const result = await evaluatePolicy({
      items: [{ sku: "sql-pro-pack", quantity: 2 }],
      maxBudgetPaise: 80000,
      clarificationNeeded: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalPaise).toBe(79800);
    expect(result.lines[0]?.unitPricePaise).toBe(39900);
    expect(result.lines[0]?.lineTotalPaise).toBe(79800);
  });

  it("approves a cart at exactly the budget boundary", async () => {
    const result = await evaluatePolicy({
      items: [{ sku: "sql-pro-pack", quantity: 2 }],
      maxBudgetPaise: 79800,
      clarificationNeeded: false,
    });
    expect(result.ok).toBe(true);
  });

  it("produces human-readable explanations", async () => {
    const result = await evaluatePolicy({
      items: [{ sku: "sql-pro-pack", quantity: 1 }],
      clarificationNeeded: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.explanations.some((line) => line.includes("inventory available"))).toBe(true);
    expect(result.explanations.some((line) => line.includes("confirmation is required"))).toBe(true);
  });
});

describe("evaluatePolicy — deterministic rejections", () => {
  it("rejects unknown SKUs with SKU_NOT_FOUND", async () => {
    const result = await evaluatePolicy({
      items: [{ sku: "ghost-sku", quantity: 1 }],
      clarificationNeeded: false,
    });
    expect(result).toMatchObject({ ok: false, code: "SKU_NOT_FOUND" });
  });

  it("rejects inactive items with ITEM_INACTIVE", async () => {
    const result = await evaluatePolicy({
      items: [{ sku: "inactive-item", quantity: 1 }],
      clarificationNeeded: false,
    });
    expect(result).toMatchObject({ ok: false, code: "ITEM_INACTIVE" });
  });

  it("rejects zero-stock items with OUT_OF_STOCK", async () => {
    const result = await evaluatePolicy({
      items: [{ sku: "sold-out-bundle", quantity: 1 }],
      clarificationNeeded: false,
    });
    expect(result).toMatchObject({ ok: false, code: "OUT_OF_STOCK" });
  });

  it("rejects quantities above available stock with OUT_OF_STOCK", async () => {
    const result = await evaluatePolicy({
      items: [{ sku: "system-design-starter", quantity: 4 }],
      clarificationNeeded: false,
    });
    expect(result).toMatchObject({ ok: false, code: "OUT_OF_STOCK" });
  });

  it("rejects carts over the per-order unit cap with ITEM_LIMIT_EXCEEDED", async () => {
    const result = await evaluatePolicy({
      items: [
        { sku: "sql-pro-pack", quantity: 3 },
        { sku: "nextjs-backend-pack", quantity: 3 },
      ],
      clarificationNeeded: false,
    });
    expect(result).toMatchObject({ ok: false, code: "ITEM_LIMIT_EXCEEDED" });
  });

  it("rejects carts over the buyer budget with BUDGET_EXCEEDED", async () => {
    const result = await evaluatePolicy({
      items: [{ sku: "sql-pro-pack", quantity: 3 }],
      maxBudgetPaise: 80000,
      clarificationNeeded: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("BUDGET_EXCEEDED");
    expect(result.message).toContain("₹1,197.00");
    expect(result.message).toContain("₹800.00");
  });

  it("rejects carts over the merchant order cap with MERCHANT_ORDER_LIMIT_EXCEEDED", async () => {
    // 4 × ₹299.00 = ₹1,196.00 > ₹1,000.00 merchant cap (stock allows it).
    const result = await evaluatePolicy({
      items: [{ sku: "database-design-pack", quantity: 4 }],
      clarificationNeeded: false,
    });
    expect(result).toMatchObject({ ok: false, code: "MERCHANT_ORDER_LIMIT_EXCEEDED" });
  });
});

describe("purchaseIntentSchema — structural quantity rules", () => {
  it.each([0, 6, -1, 1.5])("rejects invalid quantity %s", (quantity) => {
    const parsed = purchaseIntentSchema.safeParse({
      items: [{ sku: "sql-pro-pack", quantity }],
      clarificationNeeded: false,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects empty item lists and more than five lines", () => {
    expect(
      purchaseIntentSchema.safeParse({ items: [], clarificationNeeded: false }).success,
    ).toBe(false);
    expect(
      purchaseIntentSchema.safeParse({
        items: Array.from({ length: 6 }, (_, i) => ({ sku: `s${i}`, quantity: 1 })),
        clarificationNeeded: false,
      }).success,
    ).toBe(false);
  });
});
