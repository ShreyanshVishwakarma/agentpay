import { describe, expect, it } from "vitest";
import { canonicalCart, hashCart } from "@/lib/checkout/cart-hash";

describe("hashCart", () => {
  it("is deterministic for identical carts", () => {
    const cart = { items: [{ sku: "sql-pro-pack", quantity: 2 }], maxBudgetPaise: 80000 };
    expect(hashCart(cart)).toBe(hashCart({ ...cart }));
  });

  it("is independent of item order — sorted by SKU", () => {
    const a = hashCart({
      items: [
        { sku: "sql-pro-pack", quantity: 2 },
        { sku: "nextjs-backend-pack", quantity: 1 },
      ],
    });
    const b = hashCart({
      items: [
        { sku: "nextjs-backend-pack", quantity: 1 },
        { sku: "sql-pro-pack", quantity: 2 },
      ],
    });
    expect(a).toBe(b);
  });

  it("treats missing budget and null budget identically", () => {
    const items = [{ sku: "sql-pro-pack", quantity: 1 }];
    expect(hashCart({ items })).toBe(hashCart({ items, maxBudgetPaise: null }));
  });

  it("changes when quantity changes", () => {
    const base = { items: [{ sku: "sql-pro-pack", quantity: 1 }] };
    expect(hashCart(base)).not.toBe(
      hashCart({ items: [{ sku: "sql-pro-pack", quantity: 2 }] }),
    );
  });

  it("changes when budget changes", () => {
    const items = [{ sku: "sql-pro-pack", quantity: 1 }];
    expect(hashCart({ items, maxBudgetPaise: 80000 })).not.toBe(
      hashCart({ items, maxBudgetPaise: 90000 }),
    );
  });

  it("produces a SHA-256-length hex digest", () => {
    expect(hashCart({ items: [{ sku: "x", quantity: 1 }] })).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it("canonical form contains only sku + quantity + policyVersion + budget", () => {
    const canonical = canonicalCart({
      items: [{ sku: "b", quantity: 1 }, { sku: "a", quantity: 3 }],
      maxBudgetPaise: 500,
    }) as Record<string, unknown>;
    expect(Object.keys(canonical).sort()).toEqual([
      "items",
      "maxBudgetPaise",
      "policyVersion",
    ]);
    expect(canonical.items).toEqual([
      { sku: "a", quantity: 3 },
      { sku: "b", quantity: 1 },
    ]);
  });
});
