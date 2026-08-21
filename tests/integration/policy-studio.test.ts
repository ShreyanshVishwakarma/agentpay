import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  getPolicyConfig,
  evaluatePolicy,
} from "@/lib/checkout/policy-engine";
import {
  listPolicyVersions,
  updateCatalogAccess,
  updateMerchantPolicy,
} from "@/lib/policy/policy-service";
import { runPolicySimulation, SIMULATION_SCENARIOS } from "@/lib/policy/simulator";
import {
  getGlobalAuditEvents,
  verifyGlobalChain,
} from "@/lib/audit/audit-service";
import { clearSessions, seedTestData } from "../helpers/db";

beforeEach(async () => {
  await seedTestData();
  await db.merchantPolicy.deleteMany();
  await db.auditEvent.deleteMany({ where: { sessionId: null } });
  // Reset per-product access controls so scenarios start from defaults.
  await db.catalogItem.updateMany({
    data: { paused: false, agentPurchasable: true, agentDiscoverable: true, maxAgentQuantity: null },
  });
});

afterAll(async () => {
  // Leave a clean slate: legacy fallback policy + no global events.
  await db.merchantPolicy.deleteMany();
  await db.auditEvent.deleteMany({ where: { sessionId: null } });
  await db.catalogItem.updateMany({
    where: { sku: "sql-pro-pack" },
    data: { paused: false, agentPurchasable: true, maxAgentQuantity: null },
  });
});

describe("policy versioning", () => {
  it("creates a new immutable version on every save", async () => {
    const first = await updateMerchantPolicy({ maxOrderPaise: 150000 });
    const second = await updateMerchantPolicy({ maxOrderPaise: 175000 });

    expect(second.policyVersion).toBe(first.policyVersion + 1);

    const versions = await listPolicyVersions();
    expect(versions.length).toBe(2);
    // Old versions remain queryable with their original values.
    const v1 = versions.find((v) => v.policyVersion === first.policyVersion);
    expect(v1?.maxOrderPaise).toBe(150000);
    expect(v1?.supersededAt).not.toBeNull();
  });

  it("writes a POLICY_CHANGED audit event with old and new values", async () => {
    await updateMerchantPolicy({ maxItemsPerOrder: 3 });

    const events = await getGlobalAuditEvents();
    const change = events.find((event) => event.eventType === "POLICY_CHANGED");
    expect(change).toBeDefined();
    const payload = change?.payload as {
      oldValues: Record<string, unknown>;
      newValues: Record<string, unknown>;
      changedBy: string;
    };
    expect(payload.oldValues.maxItemsPerOrder).toBe(5);
    expect(payload.newValues.maxItemsPerOrder).toBe(3);
    expect(payload.changedBy).toBe("Merchant Demo Admin");
  });

  it("routes subsequent evaluations through the latest version", async () => {
    await updateMerchantPolicy({ maxItemsPerOrder: 2 });
    const current = await getPolicyConfig();
    expect(current.maxItemsPerOrder).toBe(2);

    const result = await evaluatePolicy({
      items: [
        { sku: "sql-pro-pack", quantity: 1 },
        { sku: "nextjs-backend-pack", quantity: 1 },
        { sku: "database-design-pack", quantity: 1 },
      ],
      clarificationNeeded: false,
    });
    expect(result).toMatchObject({ ok: false, code: "ITEM_LIMIT_EXCEEDED" });
  });

  it("keeps the global audit chain verifiable across changes", async () => {
    await updateMerchantPolicy({ maxOrderPaise: 120000 });
    await updateCatalogAccess({ sku: "sql-pro-pack", paused: true });
    const chain = await verifyGlobalChain();
    expect(chain.valid).toBe(true);
    expect(chain.checkedCount).toBeGreaterThanOrEqual(2);
  });
});

describe("catalog access controls", () => {
  it("a paused product cannot be purchased by an agent", async () => {
    await updateCatalogAccess({ sku: "sql-pro-pack", paused: true });
    const result = await evaluatePolicy({
      items: [{ sku: "sql-pro-pack", quantity: 1 }],
      clarificationNeeded: false,
    });
    expect(result).toMatchObject({ ok: false, code: "CATALOG_ACCESS_PAUSED" });
    if (!result.ok) {
      expect(result.details.control).toBe("catalog_access.paused");
    }
  });

  it("a human-only product is blocked from AI purchase", async () => {
    await updateCatalogAccess({ sku: "nextjs-backend-pack", agentPurchasable: false });
    const result = await evaluatePolicy({
      items: [{ sku: "nextjs-backend-pack", quantity: 1 }],
      clarificationNeeded: false,
    });
    expect(result).toMatchObject({ ok: false, code: "AGENT_PURCHASE_NOT_ALLOWED" });
  });

  it("enforces the per-product AI quantity cap", async () => {
    await updateCatalogAccess({ sku: "database-design-pack", maxAgentQuantity: 1 });
    const result = await evaluatePolicy({
      items: [{ sku: "database-design-pack", quantity: 2 }],
      clarificationNeeded: false,
    });
    expect(result).toMatchObject({ ok: false, code: "AGENT_QUANTITY_CAP_EXCEEDED" });
  });
});

describe("policy simulator", () => {
  it("approves the happy-path scenario", async () => {
    const outcome = await runPolicySimulation("two-sql-under-800");
    expect(outcome.approved).toBe(true);
  });

  it.each([
    ["three-sql-under-800", "BUDGET_EXCEEDED"],
    ["sold-out-bundle", "OUT_OF_STOCK"],
    ["six-items", "ITEM_LIMIT_EXCEEDED"],
    ["paused-product", "CATALOG_ACCESS_PAUSED"],
  ])("blocks %s with %s and names the responsible control", async (key, code) => {
    const outcome = await runPolicySimulation(key);
    expect(outcome.approved).toBe(false);
    expect(outcome.rejectionCode).toBe(code);
    expect(outcome.responsibleControl).toBeTruthy();
  });

  it("never creates checkout sessions or orders", async () => {
    await clearSessions();
    const sessionsBefore = await db.checkoutSession.count();

    for (const scenario of SIMULATION_SCENARIOS) {
      await runPolicySimulation(scenario.key);
    }

    expect(await db.checkoutSession.count()).toBe(sessionsBefore);
    expect(sessionsBefore).toBe(0);
  });
});
