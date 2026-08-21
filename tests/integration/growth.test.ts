import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getRecommendationsForCart } from "@/lib/growth/recommendations";
import { proposeCheckout } from "@/lib/agent/tools";
import { updateMerchantPolicy } from "@/lib/policy/policy-service";
import { clearSessions, resetStock, seedTestData } from "../helpers/db";

beforeEach(async () => {
  await seedTestData();
  await clearSessions();
  await resetStock();
  await db.merchantPolicy.deleteMany();
  await db.auditEvent.deleteMany({ where: { sessionId: null } });
});

describe("bounded upsell & cross-sell engine", () => {
  it("recommends complementary products for a cart", async () => {
    const recs = await getRecommendationsForCart({
      skus: ["sql-pro-pack"],
      cartTotalPaise: 39900,
      budgetPaise: null,
    });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.some((rec) => rec.sku === "nextjs-backend-pack")).toBe(true);
    expect(recs.every((rec) => rec.kind === "cross_sell" || rec.kind === "upsell")).toBe(true);
    expect(recs.every((rec) => rec.reason.length > 0 && rec.bound.length > 0)).toBe(true);
  });

  it("never exceeds the buyer's stated budget", async () => {
    // Cart ₹798 with an ₹800 budget leaves ₹2 headroom — nothing fits.
    const recs = await getRecommendationsForCart({
      skus: ["sql-pro-pack"],
      cartTotalPaise: 79800,
      budgetPaise: 80000,
    });
    expect(recs).toHaveLength(0);
  });

  it("never recommends paused, human-only, or out-of-stock items", async () => {
    await db.catalogItem.update({
      where: { sku: "nextjs-backend-pack" },
      data: { paused: true },
    });
    const recs = await getRecommendationsForCart({
      skus: ["sql-pro-pack"],
      cartTotalPaise: 39900,
      budgetPaise: null,
    });
    expect(recs.some((rec) => rec.sku === "nextjs-backend-pack")).toBe(false);
  });

  it("propose_checkout attaches suggestions and audits PRODUCT_RECOMMENDED", async () => {
    const result = await proposeCheckout({
      items: [{ sku: "sql-pro-pack", quantity: 1 }],
      sourceMessage: "[test] growth",
    });
    expect(result.status).toBe("PROPOSAL_READY");
    expect(result.upsells?.length ?? 0).toBeGreaterThan(0);

    const events = await db.auditEvent.findMany({
      where: { sessionId: result.sessionId, eventType: "PRODUCT_RECOMMENDED" },
    });
    expect(events).toHaveLength(1);
  });

  it("respects the merchant's agentCanRecommend=false toggle", async () => {
    await updateMerchantPolicy({ agentCanRecommend: false });
    const result = await proposeCheckout({
      items: [{ sku: "sql-pro-pack", quantity: 1 }],
      sourceMessage: "[test] growth disabled",
    });
    expect(result.status).toBe("PROPOSAL_READY");
    expect(result.upsells).toBeUndefined();
  });
});

describe("machine-to-machine proposal API", () => {
  it("returns a bounded proposal for a valid external-agent cart", async () => {
    const { POST } = await import("../../src/app/api/agent/v1/proposals/route");
    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ items: [{ sku: "sql-pro-pack", quantity: 1 }] }),
      }),
    );
    const data = (await response.json()) as { status?: string };
    expect(response.status).toBe(200);
    expect(data.status).toBe("PROPOSAL_READY");
  });

  it("passes deterministic policy rejections through to the agent", async () => {
    const { POST } = await import("../../src/app/api/agent/v1/proposals/route");
    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({
          items: [{ sku: "sql-pro-pack", quantity: 3 }],
          maxBudgetPaise: 80000,
        }),
      }),
    );
    const data = (await response.json()) as { status?: string; reason?: string };
    expect(data.status).toBe("REJECTED");
    expect(data.reason).toBe("BUDGET_EXCEEDED");
  });

  it("rejects malformed carts with Zod validation", async () => {
    const { POST } = await import("../../src/app/api/agent/v1/proposals/route");
    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ items: [{ sku: "sql-pro-pack", quantity: 99 }] }),
      }),
    );
    expect(response.status).toBe(400);
  });
});
