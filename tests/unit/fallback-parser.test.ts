import { describe, expect, it } from "vitest";
import { FallbackParseError, parseWithFallback } from "@/lib/agent/fallback-parser";

const CATALOG = [
  { sku: "sql-pro-pack", name: "SQL Pro Interview Pack" },
  { sku: "nextjs-backend-pack", name: "Next.js Backend Pack" },
  { sku: "database-design-pack", name: "Database Design Pack" },
  { sku: "system-design-starter", name: "System Design Starter Kit" },
  { sku: "sold-out-bundle", name: "Premium Interview Bundle" },
];

describe("parseWithFallback", () => {
  it.each([
    [
      "Buy two SQL Pro Interview Packs under ₹800",
      [{ sku: "sql-pro-pack", quantity: 2 }],
      80000,
    ],
    ["Get the Next.js Backend Pack", [{ sku: "nextjs-backend-pack", quantity: 1 }], undefined],
    [
      "Buy three SQL Pro Packs under ₹800",
      [{ sku: "sql-pro-pack", quantity: 3 }],
      80000,
    ],
    ["Buy the Premium Interview Bundle", [{ sku: "sold-out-bundle", quantity: 1 }], undefined],
  ])("parses demo prompt: %s", (message, items, budget) => {
    const intent = parseWithFallback(message, CATALOG);
    expect(intent.items).toEqual(items);
    expect(intent.maxBudgetPaise).toBe(budget);
    expect(intent.clarificationNeeded).toBe(false);
  });

  it("parses digit quantities and 'budget N' phrasing", () => {
    const intent = parseWithFallback("buy 1 database design pack budget 1000", CATALOG);
    expect(intent.items).toEqual([{ sku: "database-design-pack", quantity: 1 }]);
    expect(intent.maxBudgetPaise).toBe(100000);
  });

  it("defaults quantity to one when unspecified", () => {
    const intent = parseWithFallback("I want the system design starter kit", CATALOG);
    expect(intent.items).toEqual([{ sku: "system-design-starter", quantity: 1 }]);
  });

  it("prefers the best-matching item when keywords overlap", () => {
    // "interview" appears in two names; "premium bundle" is more specific.
    const intent = parseWithFallback("Buy the Premium Interview Bundle", CATALOG);
    expect(intent.items[0]?.sku).toBe("sold-out-bundle");
  });

  it("throws a safe error when nothing matches", () => {
    expect(() => parseWithFallback("hello there friend", CATALOG)).toThrow(
      FallbackParseError,
    );
  });

  it("ignores budget patterns that are not present", () => {
    const intent = parseWithFallback("Get the Next.js Backend Pack", CATALOG);
    expect(intent.maxBudgetPaise).toBeUndefined();
  });
});
