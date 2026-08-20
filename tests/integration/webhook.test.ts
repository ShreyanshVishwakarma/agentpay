import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckoutPreview, confirmCheckout } from "@/lib/checkout/checkout-service";
import { processRazorpayWebhook } from "@/lib/razorpay/webhook-service";
import { getSessionEvents, verifySessionChain } from "@/lib/audit/audit-service";
import { db } from "@/lib/db";
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
      id: `order_wh_${String(init.body?.amount ?? 0)}`,
      amount: init.body?.amount ?? 0,
      currency: "INR",
      receipt: init.body?.receipt ?? "",
      status: "created",
    }),
  };
});

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET as string;

let deliveryCounter = 0;

function signedDelivery(
  body: Record<string, unknown>,
  secret: string = WEBHOOK_SECRET,
): { rawBody: string; signature: string; eventId: string } {
  const rawBody = JSON.stringify(body);
  deliveryCounter += 1;
  return {
    rawBody,
    signature: createHmac("sha256", secret).update(rawBody).digest("hex"),
    eventId: `evt_test_${deliveryCounter}`,
  };
}

function capturedEvent(orderId: string, paymentId: string, amount: number): Record<string, unknown> {
  return {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          amount,
          currency: "INR",
          status: "captured",
          notes: {},
        },
      },
    },
  };
}

/** Create a confirmed session with a live mock order; returns its ids. */
async function createConfirmedSession(sku: string, quantity: number) {
  const preview = await createCheckoutPreview({
    intent: { items: [{ sku, quantity }], clarificationNeeded: false },
  });
  if (preview.kind !== "approved") throw new Error("preview should approve");
  const confirmed = await confirmCheckout(preview.sessionId);
  if (confirmed.kind !== "order_created") throw new Error("confirm should succeed");
  return {
    sessionId: preview.sessionId,
    orderId: confirmed.razorpay.orderId,
    totalPaise: confirmed.razorpay.amountPaise,
  };
}

beforeEach(async () => {
  await seedTestData();
  await clearSessions();
  await resetStock();
});

describe("razorpay webhook pipeline", () => {
  it("fulfils a valid payment.captured delivery exactly once", async () => {
    const session = await createConfirmedSession("sql-pro-pack", 2);

    const delivery = signedDelivery(
      capturedEvent(session.orderId, "pay_wh_1", session.totalPaise),
    );
    const response = await processRazorpayWebhook(delivery);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ received: true, action: "fulfilled" });

    const updated = await db.checkoutSession.findUnique({ where: { id: session.sessionId } });
    expect(updated?.status).toBe("PAYMENT_VERIFIED");
    expect(updated?.razorpayPaymentId).toBe("pay_wh_1");

    const item = await db.catalogItem.findUnique({ where: { sku: "sql-pro-pack" } });
    expect(item?.stock).toBe(8);

    const inbox = await db.webhookEvent.findUnique({ where: { eventId: delivery.eventId } });
    expect(inbox?.status).toBe("PROCESSED");

    const types = (await getSessionEvents(session.sessionId)).map((e) => e.eventType);
    expect(types).toContain("RAZORPAY_WEBHOOK_VERIFIED");
    expect(types).toContain("PAYMENT_VERIFIED_VIA_WEBHOOK");
    expect((await verifySessionChain(session.sessionId)).valid).toBe(true);
  });

  it("ignores redelivered events without double-fulfilling", async () => {
    const session = await createConfirmedSession("sql-pro-pack", 1);
    const delivery = signedDelivery(
      capturedEvent(session.orderId, "pay_wh_2", session.totalPaise),
    );

    const first = await processRazorpayWebhook(delivery);
    const replay = await processRazorpayWebhook(delivery);

    expect(first.body.action).toBe("fulfilled");
    expect(replay.body).toMatchObject({ received: true, duplicate: true, action: "ignored" });

    const item = await db.catalogItem.findUnique({ where: { sku: "sql-pro-pack" } });
    expect(item?.stock).toBe(9); // decremented exactly once

    const verifiedEvents = (await getSessionEvents(session.sessionId)).filter(
      (e) => e.eventType === "PAYMENT_VERIFIED_VIA_WEBHOOK",
    );
    expect(verifiedEvents).toHaveLength(1);
  });

  it("rejects deliveries with an invalid signature", async () => {
    const session = await createConfirmedSession("nextjs-backend-pack", 1);
    const delivery = signedDelivery(
      capturedEvent(session.orderId, "pay_wh_3", session.totalPaise),
    );

    const response = await processRazorpayWebhook({
      rawBody: delivery.rawBody,
      signature: "forged".repeat(8),
      eventId: delivery.eventId,
    });

    expect(response.status).toBe(400);
    expect(response.body.received).toBe(false);

    const updated = await db.checkoutSession.findUnique({ where: { id: session.sessionId } });
    expect(updated?.status).toBe("ORDER_CREATED"); // untouched

    const item = await db.catalogItem.findUnique({ where: { sku: "nextjs-backend-pack" } });
    expect(item?.stock).toBe(8); // untouched

    const inbox = await db.webhookEvent.findUnique({ where: { eventId: delivery.eventId } });
    expect(inbox).toBeNull(); // rejected deliveries never enter the inbox
  });

  it("fails the session when the captured amount does not match the approved total", async () => {
    const session = await createConfirmedSession("database-design-pack", 1);
    const tamperedAmount = session.totalPaise - 10000; // underpaid

    const delivery = signedDelivery(
      capturedEvent(session.orderId, "pay_wh_4", tamperedAmount),
    );
    const response = await processRazorpayWebhook(delivery);

    expect(response.body.action).toBe("amount_mismatch");

    const updated = await db.checkoutSession.findUnique({ where: { id: session.sessionId } });
    expect(updated?.status).toBe("PAYMENT_FAILED");

    const item = await db.catalogItem.findUnique({ where: { sku: "database-design-pack" } });
    expect(item?.stock).toBe(15); // no fulfillment

    const types = (await getSessionEvents(session.sessionId)).map((e) => e.eventType);
    expect(types).toContain("PAYMENT_MARKED_FAILED");
  });

  it("marks the session failed on payment.failed webhooks", async () => {
    const session = await createConfirmedSession("sql-pro-pack", 1);
    const delivery = signedDelivery({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: "pay_wh_failed",
            order_id: session.orderId,
            amount: session.totalPaise,
            status: "failed",
          },
        },
      },
    });

    const response = await processRazorpayWebhook(delivery);
    expect(response.body.action).toBe("marked_failed");

    const updated = await db.checkoutSession.findUnique({ where: { id: session.sessionId } });
    expect(updated?.status).toBe("PAYMENT_FAILED");

    const item = await db.catalogItem.findUnique({ where: { sku: "sql-pro-pack" } });
    expect(item?.stock).toBe(10);
  });

  it("is idempotent when the browser callback already fulfilled the payment", async () => {
    const { verifyPayment } = await import("@/lib/checkout/checkout-service");
    const session = await createConfirmedSession("sql-pro-pack", 2);

    // Browser callback fulfils first.
    const callback = await verifyPayment({
      checkoutSessionId: session.sessionId,
      razorpayPaymentId: "pay_both_paths",
      razorpayOrderId: session.orderId,
      signature: createHmac("sha256", process.env.RAZORPAY_KEY_SECRET as string)
        .update(`${session.orderId}|pay_both_paths`)
        .digest("hex"),
    });
    expect(callback.verified).toBe(true);

    // The webhook for the same payment arrives afterwards.
    const delivery = signedDelivery(
      capturedEvent(session.orderId, "pay_both_paths", session.totalPaise),
    );
    const response = await processRazorpayWebhook(delivery);

    expect(response.body.action).toBe("already_verified");

    const item = await db.catalogItem.findUnique({ where: { sku: "sql-pro-pack" } });
    expect(item?.stock).toBe(8); // decremented exactly once across both paths
  });

  it("responds OK but ignores unknown orders and unrelated event types", async () => {
    const unknownOrder = signedDelivery(capturedEvent("order_does_not_exist", "pay_x", 79800));
    expect((await processRazorpayWebhook(unknownOrder)).body.action).toBe("unknown_order");

    const unrelated = signedDelivery({
      event: "refund.processed",
      payload: { refund: { entity: { id: "rfn_1" } } },
    });
    const refundResponse = await processRazorpayWebhook(unrelated);
    expect(refundResponse.status).toBe(200);
    expect(refundResponse.body.action).toBe("ignored");

    const ignoredRow = await db.webhookEvent.findUnique({ where: { eventId: unrelated.eventId } });
    expect(ignoredRow?.status).toBe("IGNORED");
  });
});
