import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { runBuyingAgent } from "@/lib/agent/agent-loop";
import { clearSessions, resetStock, seedTestData } from "../helpers/db";

beforeEach(async () => {
  await seedTestData();
  await clearSessions();
  await resetStock();
});

describe("buying agent loop (deterministic fallback planner)", () => {
  it("drives tools end-to-end and produces a bounded checkout proposal", async () => {
    const result = await runBuyingAgent(
      "I need something under ₹500 to prepare for SQL interviews",
    );

    expect(result.mode).toBe("fallback");
    const tools = result.trace.map((step) => step.tool);
    expect(tools).toContain("search_catalog");
    expect(tools).toContain("propose_checkout");

    expect(result.outcome.type).toBe("proposal");
    if (result.outcome.type !== "proposal") return;

    const session = await db.checkoutSession.findUnique({
      where: { id: result.outcome.sessionId },
    });
    expect(session?.status).toBe("AWAITING_CONFIRMATION");
    expect(session?.razorpayOrderId).toBeNull(); // no order without confirmation
  });

  it("lets the policy engine veto when the best match exceeds budget", async () => {
    const result = await runBuyingAgent("find me SQL prep under ₹350");
    // The only SQL product is ₹399 — the agent proposes it honestly and the
    // deterministic policy engine rejects it.
    expect(result.outcome.type).toBe("rejection");
    if (result.outcome.type !== "rejection") return;
    expect(result.outcome.code).toBe("BUDGET_EXCEEDED");
  });

  it("asks a clarifying question when nothing matches", async () => {
    const result = await runBuyingAgent("I want a unicorn plushie for my desk");
    expect(result.outcome.type).toBe("clarification");
  });

  it("surfaces deterministic policy rejections from propose_checkout", async () => {
    // Budget too low for any matching product → proposal rejected by policy.
    const result = await runBuyingAgent("SQL pack under ₹100");
    expect(result.outcome.type).toBe("rejection");
    if (result.outcome.type !== "rejection") return;
    expect(result.outcome.code).toBe("BUDGET_EXCEEDED");
  });

  it("never creates a Razorpay order during the loop", async () => {
    await runBuyingAgent("Get me the Next.js Backend Pack");
    const orders = await db.checkoutSession.count({
      where: { razorpayOrderId: { not: null } },
    });
    expect(orders).toBe(0);
  });
});
