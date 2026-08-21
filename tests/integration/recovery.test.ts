import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  acceptAlternativeOffer,
  approveAndExecuteRecovery,
  declineRecovery,
  getRecoveryQueue,
  markRecoveredIfLinked,
  scanForRecoveryOpportunities,
} from "@/lib/recovery/recovery-service";
import { verifyPayment } from "@/lib/checkout/checkout-service";
import { processRazorpayWebhook } from "@/lib/razorpay/webhook-service";
import { getSessionEvents, verifySessionChain } from "@/lib/audit/audit-service";
import { clearSessions, resetStock, seedTestData } from "../helpers/db";

vi.mock("@/lib/razorpay/client", () => {
  class RazorpayApiError extends Error {
    readonly status: number;
    readonly publicMessage: string;
    constructor(status: number, message: string, publicMessage: string) {
      super(message);
      this.status = status;
      this.publicMessage = publicMessage;
    }
  }
  return {
    RazorpayApiError,
    isRazorpayConfigured: () => true,
    razorpayRequest: async (
      _path: string,
      init: { method: string; body?: { amount?: number; receipt?: string } },
    ) => ({
      id: `order_rc_${String(init.body?.amount ?? 0)}`,
      amount: init.body?.amount ?? 0,
      currency: "INR",
      receipt: init.body?.receipt ?? "",
      status: "created",
    }),
  };
});

const SECRET = process.env.RAZORPAY_KEY_SECRET as string;

async function createSession(input: {
  status: string;
  sku: string;
  quantity?: number;
  totalPaise?: number;
  daysBack?: number;
  rejectionReason?: string;
}): Promise<string> {
  const catalogItem = await db.catalogItem.findUnique({ where: { sku: input.sku } });
  if (!catalogItem) throw new Error("missing catalog item");
  const quantity = input.quantity ?? 1;
  const totalPaise = input.totalPaise ?? catalogItem.pricePaise * quantity;
  const createdAt = new Date(Date.now() - (input.daysBack ?? 1) * 86400000);

  const session = await db.checkoutSession.create({
    data: {
      cartHash: `recovery_${Math.random().toString(36).slice(2)}`,
      status: input.status,
      totalPaise,
      razorpayOrderId:
        input.status === "PAYMENT_FAILED" || input.status === "ORDER_CREATED"
          ? `order_rc_${Math.random().toString(36).slice(2, 10)}`
          : null,
      rejectionReason: input.rejectionReason ?? null,
      idempotencyKey: `idem_${Math.random().toString(36).slice(2)}`,
      createdAt,
      updatedAt: createdAt,
    },
  });

  await db.checkoutItem.create({
    data: {
      sessionId: session.id,
      catalogItemId: catalogItem.id,
      sku: input.sku,
      itemName: catalogItem.name,
      unitPricePaise: catalogItem.pricePaise,
      quantity,
      lineTotalPaise: totalPaise,
    },
  });

  // Minimal valid chain so lifecycle audits append cleanly.
  const { recordAuditEvent } = await import("@/lib/audit/audit-service");
  await recordAuditEvent({
    sessionId: session.id,
    eventType: "INTENT_RECEIVED",
    actor: "BUYER",
    payload: { sourceMessage: "[test] recovery fixture" },
  });
  return session.id;
}

beforeEach(async () => {
  await seedTestData();
  await clearSessions();
  await resetStock();
});

describe("recovery case creation", () => {
  it("creates an eligible case for a failed payment with stock", async () => {
    const sessionId = await createSession({ status: "PAYMENT_FAILED", sku: "sql-pro-pack" });
    const result = await scanForRecoveryOpportunities();

    expect(result.created).toBeGreaterThanOrEqual(1);
    const recoveryCase = await db.recoveryCase.findUnique({
      where: { checkoutSessionId: sessionId },
    });
    expect(recoveryCase?.status).toBe("ELIGIBLE");
    expect(recoveryCase?.interventionType).toBe("SEND_PAYMENT_REMINDER");

    const types = (await getSessionEvents(sessionId)).map((e) => e.eventType);
    expect(types).toContain("REVENUE_OPPORTUNITY_IDENTIFIED");
    expect(types).toContain("RECOVERY_CASE_CREATED");
    expect(types).toContain("RECOVERY_PROPOSED");
  });

  it("does not create a case for an ineligible (too-old) session", async () => {
    await createSession({
      status: "PAYMENT_FAILED",
      sku: "sql-pro-pack",
      daysBack: 30,
    });
    await scanForRecoveryOpportunities();
    expect(await db.recoveryCase.count()).toBe(0);
  });

  it("never creates two cases for the same session", async () => {
    await createSession({ status: "PAYMENT_FAILED", sku: "sql-pro-pack" });
    await scanForRecoveryOpportunities();
    await scanForRecoveryOpportunities();
    expect(await db.recoveryCase.count()).toBe(1);
  });
});

describe("merchant approval gate", () => {
  it("requires approval before any buyer-facing alternative can be accepted", async () => {
    const sessionId = await createSession({
      status: "REJECTED",
      sku: "sold-out-bundle",
      totalPaise: 99900,
      rejectionReason: "OUT_OF_STOCK",
    });
    await scanForRecoveryOpportunities();
    const recoveryCase = await db.recoveryCase.findUnique({
      where: { checkoutSessionId: sessionId },
    });

    // Case exists but no action has been approved/executed yet.
    await expect(acceptAlternativeOffer(recoveryCase!.id)).rejects.toMatchObject({
      code: "NOT_ACTIONED",
    });
  });

  it("executes a simulated action only after explicit merchant approval", async () => {
    const sessionId = await createSession({ status: "PAYMENT_FAILED", sku: "sql-pro-pack" });
    await scanForRecoveryOpportunities();
    const recoveryCase = await db.recoveryCase.findUnique({
      where: { checkoutSessionId: sessionId },
    });

    const result = await approveAndExecuteRecovery(recoveryCase!.id);
    expect(result.copyMode).toBe("template"); // no OPENAI key in tests
    expect(result.message).toContain("Test sql-pro-pack");

    const updated = await db.recoveryCase.findUnique({ where: { id: recoveryCase!.id } });
    expect(updated?.status).toBe("ACTION_EXECUTED");
    expect(updated?.attemptCount).toBe(1);

    const types = (await getSessionEvents(sessionId)).map((e) => e.eventType);
    expect(types).toContain("RECOVERY_APPROVED");
    expect(types).toContain("RECOVERY_EXECUTED");

    const queue = await getRecoveryQueue();
    expect(queue.some((entry) => entry.id === recoveryCase!.id)).toBe(true);
  });

  it("stops at the maximum of two recovery attempts", async () => {
    const sessionId = await createSession({ status: "PAYMENT_FAILED", sku: "sql-pro-pack" });
    await scanForRecoveryOpportunities();
    const recoveryCase = await db.recoveryCase.findUnique({
      where: { checkoutSessionId: sessionId },
    });

    await approveAndExecuteRecovery(recoveryCase!.id);
    await db.recoveryCase.update({
      where: { id: recoveryCase!.id },
      data: { attemptCount: 2 },
    });

    await expect(approveAndExecuteRecovery(recoveryCase!.id)).rejects.toMatchObject({
      code: "MAX_ATTEMPTS",
    });
  });

  it("refuses to act on stopped cases", async () => {
    const sessionId = await createSession({ status: "PAYMENT_FAILED", sku: "sql-pro-pack" });
    await scanForRecoveryOpportunities();
    const recoveryCase = await db.recoveryCase.findUnique({
      where: { checkoutSessionId: sessionId },
    });
    await declineRecovery(recoveryCase!.id);

    await expect(approveAndExecuteRecovery(recoveryCase!.id)).rejects.toMatchObject({
      code: "CASE_CLOSED",
    });
  });

  it("blocks recovery when inventory can no longer satisfy the request", async () => {
    const sessionId = await createSession({ status: "PAYMENT_FAILED", sku: "sql-pro-pack" });
    await scanForRecoveryOpportunities();
    const recoveryCase = await db.recoveryCase.findUnique({
      where: { checkoutSessionId: sessionId },
    });

    await db.catalogItem.updateMany({
      where: { sku: "sql-pro-pack" },
      data: { stock: 0 },
    });

    await expect(approveAndExecuteRecovery(recoveryCase!.id)).rejects.toMatchObject({
      code: "NO_STOCK",
    });
  });
});

describe("recovered payments keep every safety control", () => {
  it("a recovered payment still requires signature verification and marks the case RECOVERED", async () => {
    const sessionId = await createSession({ status: "PAYMENT_FAILED", sku: "sql-pro-pack" });
    await scanForRecoveryOpportunities();
    const recoveryCase = await db.recoveryCase.findUnique({
      where: { checkoutSessionId: sessionId },
    });
    await approveAndExecuteRecovery(recoveryCase!.id);

    const session = await db.checkoutSession.findUnique({ where: { id: sessionId } });
    const paymentId = "pay_recovered_1";

    // Forged signature → no fulfillment, case stays open.
    const forged = await verifyPayment({
      checkoutSessionId: sessionId,
      razorpayPaymentId: paymentId,
      razorpayOrderId: session!.razorpayOrderId!,
      signature: "f".repeat(64),
    });
    expect(forged.verified).toBe(false);

    // Valid signature → fulfillment + RECOVERED.
    const valid = await verifyPayment({
      checkoutSessionId: sessionId,
      razorpayPaymentId: paymentId,
      razorpayOrderId: session!.razorpayOrderId!,
      signature: createHmac("sha256", SECRET)
        .update(`${session!.razorpayOrderId}|${paymentId}`)
        .digest("hex"),
    });
    expect(valid.verified).toBe(true);

    const updated = await db.recoveryCase.findUnique({ where: { id: recoveryCase!.id } });
    expect(updated?.status).toBe("RECOVERED");
    expect(updated?.actualRecoveredValuePaise).toBe(session!.totalPaise);

    const types = (await getSessionEvents(sessionId)).map((e) => e.eventType);
    expect(types).toContain("RECOVERY_SUCCEEDED");
    expect((await verifySessionChain(sessionId)).valid).toBe(true);
  });

  it("duplicate webhook deliveries cannot fulfil recovered inventory twice", async () => {
    const sessionId = await createSession({ status: "PAYMENT_FAILED", sku: "nextjs-backend-pack" });
    await scanForRecoveryOpportunities();
    const recoveryCase = await db.recoveryCase.findUnique({
      where: { checkoutSessionId: sessionId },
    });
    await approveAndExecuteRecovery(recoveryCase!.id);

    const session = await db.checkoutSession.findUnique({ where: { id: sessionId } });
    const body = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_wh_recovered",
            order_id: session!.razorpayOrderId!,
            amount: session!.totalPaise,
            status: "captured",
          },
        },
      },
    });
    const delivery = {
      rawBody: body,
      signature: createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET as string)
        .update(body)
        .digest("hex"),
      eventId: "evt_recovery_dup_test",
    };

    const first = await processRazorpayWebhook(delivery);
    const replay = await processRazorpayWebhook(delivery);

    expect(first.body.action).toBe("fulfilled");
    expect(replay.body.duplicate).toBe(true);

    const item = await db.catalogItem.findUnique({ where: { sku: "nextjs-backend-pack" } });
    expect(item?.stock).toBe(7); // decremented exactly once

    const updated = await db.recoveryCase.findUnique({ where: { id: recoveryCase!.id } });
    expect(updated?.status).toBe("RECOVERED");
  });

  it("markRecoveredIfLinked is a no-op for sessions without cases", async () => {
    const sessionId = await createSession({ status: "PAYMENT_VERIFIED", sku: "sql-pro-pack" });
    await markRecoveredIfLinked(sessionId, 39900);
    expect(await db.recoveryCase.count()).toBe(0);
  });
});

describe("API validation", () => {
  it("rejects malformed case ids with 400 via Zod", async () => {
    const { POST } = await import("../../src/app/api/recovery/[caseId]/decline/route");
    const response = await POST(new Request("http://localhost/api"), {
      params: Promise.resolve({ caseId: "" }),
    });
    expect(response.status).toBe(400);
  });
});
