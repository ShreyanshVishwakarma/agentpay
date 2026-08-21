import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { computeInsights } from "@/lib/insights/metrics";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { clearSessions, seedTestData } from "../helpers/db";

beforeEach(async () => {
  await seedTestData();
  await clearSessions();
});

afterAll(async () => {
  await clearSessions();
});

interface FixtureSession {
  key: string;
  status: string;
  totalPaise: number;
  razorpayOrderId?: string;
  attemptedTotalPaise?: number;
  rejectionReason?: string;
}

/**
 * Craft a minimal deterministic fixture set:
 * - s1, s2: verified payments (₹399.00 + ₹299.00)
 * - s3: failed payment (₹499.00) with a live order
 * - s4: budget-exceeded rejection with attempted value ₹1,197.00
 */
async function createFixture(session: FixtureSession): Promise<string> {
  const created = await db.checkoutSession.create({
    data: {
      cartHash: `insights_${session.key}`,
      status: session.status,
      totalPaise: session.totalPaise,
      razorpayOrderId: session.razorpayOrderId ?? null,
      rejectionReason: session.rejectionReason ?? null,
      ...(session.attemptedTotalPaise !== undefined
        ? {
            rejectionDetails: {
              attemptedTotalPaise: session.attemptedTotalPaise,
            } as never,
          }
        : {}),
      idempotencyKey: `idem_${session.key}`,
    },
  });

  if (session.status === "REJECTED") {
    await recordAuditEvent({
      sessionId: created.id,
      eventType: "INTENT_RECEIVED",
      actor: "BUYER",
      payload: { sourceMessage: `[test] ${session.key}` },
    });
    return created.id;
  }

  await recordAuditEvent({
    sessionId: created.id,
    eventType: "INTENT_RECEIVED",
    actor: "BUYER",
    payload: { sourceMessage: `[test] ${session.key}` },
  });
  await recordAuditEvent({
    sessionId: created.id,
    eventType: "CHECKOUT_PREVIEW_CREATED",
    actor: "SYSTEM",
    payload: { totalPaise: session.totalPaise },
  });
  await recordAuditEvent({
    sessionId: created.id,
    eventType: "BUYER_CONFIRMED",
    actor: "BUYER",
    payload: {},
  });
  return created.id;
}

describe("insights metrics", () => {
  it("computes funnel counts, revenue verified / protected / at-risk in integer paise", async () => {
    await createFixture({ key: "s1", status: "PAYMENT_VERIFIED", totalPaise: 39900, razorpayOrderId: "order_t1" });
    await createFixture({ key: "s2", status: "PAYMENT_VERIFIED", totalPaise: 29900, razorpayOrderId: "order_t2" });
    await createFixture({ key: "s3", status: "PAYMENT_FAILED", totalPaise: 49900, razorpayOrderId: "order_t3" });
    await createFixture({
      key: "s4",
      status: "REJECTED",
      totalPaise: 0,
      attemptedTotalPaise: 119700,
      rejectionReason: "BUDGET_EXCEEDED",
    });

    const insights = await computeInsights();

    // Funnel counts.
    const byLabel = new Map(insights.funnel.map((stage) => [stage.label, stage]));
    expect(byLabel.get("Intent received")?.count).toBe(4);
    expect(byLabel.get("Cart previewed")?.count).toBe(3);
    expect(byLabel.get("Buyer confirmed")?.count).toBe(3);
    expect(byLabel.get("Razorpay Order created")?.count).toBe(3);
    expect(byLabel.get("Payment verified")?.count).toBe(2);

    // Money math — exact paise, no float drift.
    expect(insights.revenueVerifiedPaise).toBe(69800);
    expect(insights.revenueProtectedPaise).toBe(119700);
    expect(insights.revenueAtRiskPaise).toBe(49900);
    expect(insights.verifiedPayments).toBe(2);
    expect(insights.rejectedUnsafeRequests).toBe(1);

    // Funnel stage values use integers too.
    expect(byLabel.get("Payment verified")?.valuePaise).toBe(69800);
  });

  it("never counts successful payments as revenue protected", async () => {
    await createFixture({ key: "only_verified", status: "PAYMENT_VERIFIED", totalPaise: 50000, razorpayOrderId: "order_v" });
    const insights = await computeInsights();
    expect(insights.revenueVerifiedPaise).toBe(50000);
    expect(insights.revenueProtectedPaise).toBe(0);
  });

  it("reports zero recovery conversion when no cases exist", async () => {
    const insights = await computeInsights();
    expect(insights.recoveryConversionRate).toBe(0);
  });
});
