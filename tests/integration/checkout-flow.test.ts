import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckoutPreview, confirmCheckout, verifyPayment } from "@/lib/checkout/checkout-service";
import { verifySessionChain } from "@/lib/audit/audit-service";
import { getSessionEvents } from "@/lib/audit/audit-service";
import { db } from "@/lib/db";
import { clearSessions, resetStock, seedTestData } from "../helpers/db";

// ---------------------------------------------------------------------------
// Mock the Razorpay REST boundary. Orders are recorded so tests can assert
// exactly how many were created (duplicate-protection guarantee).
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  orderCalls: [] as Array<{ amount: number; receipt: string }>,
}));

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
    ) => {
      const amount = init.body?.amount ?? 0;
      const receipt = init.body?.receipt ?? "";
      mocks.orderCalls.push({ amount, receipt });
      return {
        id: `order_mock_${String(mocks.orderCalls.length).padStart(3, "0")}`,
        amount,
        currency: "INR",
        receipt,
        status: "created",
      };
    },
  };
});

const SECRET = process.env.RAZORPAY_KEY_SECRET as string;

function sign(orderId: string, paymentId: string): string {
  return createHmac("sha256", SECRET).update(`${orderId}|${paymentId}`).digest("hex");
}

async function seedAndClear(): Promise<void> {
  await seedTestData();
  await clearSessions();
  await resetStock();
}

beforeEach(seedAndClear);

describe("full payment lifecycle", () => {
  it("preview -> confirm -> verify fulfills exactly once", async () => {
    const preview = await createCheckoutPreview({
      intent: {
        items: [{ sku: "sql-pro-pack", quantity: 2 }],
        maxBudgetPaise: 80000,
        clarificationNeeded: false,
      },
      sourceMessage: "test success flow",
    });
    expect(preview.kind).toBe("approved");
    if (preview.kind !== "approved") return;

    // No order exists before confirmation.
    expect(mocks.orderCalls).toHaveLength(0);

    const confirmed = await confirmCheckout(preview.sessionId);
    expect(confirmed).toMatchObject({
      kind: "order_created",
      reused: false,
    });
    if (confirmed.kind !== "order_created") return;

    expect(confirmed.razorpay.amountPaise).toBe(79800);
    expect(confirmed.razorpay.keyId).toBe(process.env.RAZORPAY_KEY_ID);
    expect(JSON.stringify(confirmed)).not.toContain(SECRET);

    const midSession = await db.checkoutSession.findUnique({
      where: { id: preview.sessionId },
    });
    expect(midSession?.status).toBe("ORDER_CREATED");
    expect(midSession?.razorpayOrderId).toBe(confirmed.razorpay.orderId);

    // Stock must NOT decrement at order-creation time.
    const midItem = await db.catalogItem.findUnique({ where: { sku: "sql-pro-pack" } });
    expect(midItem?.stock).toBe(10);

    const paymentId = "pay_test_success_1";
    const result = await verifyPayment({
      checkoutSessionId: preview.sessionId,
      razorpayPaymentId: paymentId,
      razorpayOrderId: confirmed.razorpay.orderId,
      signature: sign(confirmed.razorpay.orderId, paymentId),
    });

    expect(result.verified).toBe(true);
    if (!result.verified) return;
    expect(result.status).toBe("PAYMENT_VERIFIED");

    const fulfilledSession = await db.checkoutSession.findUnique({
      where: { id: preview.sessionId },
    });
    expect(fulfilledSession?.status).toBe("PAYMENT_VERIFIED");
    expect(fulfilledSession?.razorpayPaymentId).toBe(paymentId);

    const item = await db.catalogItem.findUnique({ where: { sku: "sql-pro-pack" } });
    expect(item?.stock).toBe(8);

    const events = await getSessionEvents(preview.sessionId);
    const types = events.map((event) => event.eventType);
    expect(types).toContain("RAZORPAY_ORDER_CREATE_STARTED");
    expect(types).toContain("RAZORPAY_ORDER_CREATED");
    expect(types).toContain("PAYMENT_CALLBACK_RECEIVED");
    expect(types).toContain("PAYMENT_SIGNATURE_VERIFIED");

    const chain = await verifySessionChain(preview.sessionId);
    expect(chain.valid).toBe(true);
  });

  it("never decrements stock when the signature is forged", async () => {
    const preview = await createCheckoutPreview({
      intent: { items: [{ sku: "sql-pro-pack", quantity: 1 }], clarificationNeeded: false },
    });
    if (preview.kind !== "approved") throw new Error("preview should approve");
    const confirmed = await confirmCheckout(preview.sessionId);
    if (confirmed.kind !== "order_created") throw new Error("confirm should succeed");

    const result = await verifyPayment({
      checkoutSessionId: preview.sessionId,
      razorpayPaymentId: "pay_forged_1",
      razorpayOrderId: confirmed.razorpay.orderId,
      signature: "deadbeef".repeat(8),
    });

    expect(result.verified).toBe(false);
    if (result.verified) return;
    expect(result.code).toBe("PAYMENT_SIGNATURE_INVALID");

    const session = await db.checkoutSession.findUnique({
      where: { id: preview.sessionId },
    });
    expect(session?.status).toBe("PAYMENT_FAILED");

    const item = await db.catalogItem.findUnique({ where: { sku: "sql-pro-pack" } });
    expect(item?.stock).toBe(10);

    const types = (await getSessionEvents(preview.sessionId)).map((e) => e.eventType);
    expect(types).toContain("PAYMENT_SIGNATURE_REJECTED");
    expect(types).toContain("PAYMENT_MARKED_FAILED");
  });

  it("is idempotent when verification is called twice with the same payment", async () => {
    const preview = await createCheckoutPreview({
      intent: { items: [{ sku: "nextjs-backend-pack", quantity: 1 }], clarificationNeeded: false },
    });
    if (preview.kind !== "approved") throw new Error("preview should approve");
    const confirmed = await confirmCheckout(preview.sessionId);
    if (confirmed.kind !== "order_created") throw new Error("confirm should succeed");

    const callback = {
      checkoutSessionId: preview.sessionId,
      razorpayPaymentId: "pay_double_1",
      razorpayOrderId: confirmed.razorpay.orderId,
      signature: sign(confirmed.razorpay.orderId, "pay_double_1"),
    };

    const first = await verifyPayment(callback);
    const second = await verifyPayment(callback);

    expect(first.verified).toBe(true);
    expect(second.verified).toBe(true);

    const item = await db.catalogItem.findUnique({ where: { sku: "nextjs-backend-pack" } });
    expect(item?.stock).toBe(7); // decremented exactly once

    const verifiedEvents = (await getSessionEvents(preview.sessionId)).filter(
      (event) => event.eventType === "PAYMENT_SIGNATURE_VERIFIED",
    );
    expect(verifiedEvents).toHaveLength(1);
  });

  it("rejects callbacks referencing a different Razorpay order", async () => {
    const preview = await createCheckoutPreview({
      intent: { items: [{ sku: "database-design-pack", quantity: 1 }], clarificationNeeded: false },
    });
    if (preview.kind !== "approved") throw new Error("preview should approve");
    const confirmed = await confirmCheckout(preview.sessionId);
    if (confirmed.kind !== "order_created") throw new Error("confirm should succeed");

    const result = await verifyPayment({
      checkoutSessionId: preview.sessionId,
      razorpayPaymentId: "pay_cross_1",
      razorpayOrderId: "order_from_another_session",
      signature: sign("order_from_another_session", "pay_cross_1"),
    });

    expect(result.verified).toBe(false);
    if (result.verified) return;
    expect(result.code).toBe("PAYMENT_SIGNATURE_INVALID");

    const item = await db.catalogItem.findUnique({ where: { sku: "database-design-pack" } });
    expect(item?.stock).toBe(15);
  });
});

describe("duplicate confirmation protection", () => {
  it("reuses the existing order on repeated confirmation", async () => {
    const preview = await createCheckoutPreview({
      intent: { items: [{ sku: "sql-pro-pack", quantity: 1 }], clarificationNeeded: false },
    });
    if (preview.kind !== "approved") throw new Error("preview should approve");

    const first = await confirmCheckout(preview.sessionId);
    expect(first.kind).toBe("order_created");
    const callsAfterFirst = mocks.orderCalls.length;

    const second = await confirmCheckout(preview.sessionId);
    expect(second).toMatchObject({ kind: "order_created", reused: true });
    if (second.kind !== "order_created") return;
    if (first.kind !== "order_created") return;

    expect(second.razorpay.orderId).toBe(first.razorpay.orderId);
    expect(mocks.orderCalls.length).toBe(callsAfterFirst); // no second order

    const types = (await getSessionEvents(preview.sessionId)).map((e) => e.eventType);
    expect(types).toContain("DUPLICATE_SESSION_REUSED");
  });

  it("creates at most one order under concurrent confirmation", async () => {
    const preview = await createCheckoutPreview({
      intent: { items: [{ sku: "sql-pro-pack", quantity: 2 }], clarificationNeeded: false },
    });
    if (preview.kind !== "approved") throw new Error("preview should approve");

    const callsBefore = mocks.orderCalls.length;
    const outcomes = await Promise.allSettled([
      confirmCheckout(preview.sessionId),
      confirmCheckout(preview.sessionId),
      confirmCheckout(preview.sessionId),
    ]);

    const fulfilled = outcomes
      .filter((o): o is PromiseFulfilledResult<Awaited<ReturnType<typeof confirmCheckout>>> =>
        o.status === "fulfilled")
      .map((o) => o.value);

    const created = fulfilled.filter((o) => o.kind === "order_created" && !o.reused);
    expect(created).toHaveLength(1); // exactly one winner
    expect(mocks.orderCalls.length - callsBefore).toBe(1); // exactly one gateway order

    const sessions = await db.checkoutSession.findMany({
      where: { cartHash: preview.cartHash },
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.razorpayOrderId).toMatch(/^order_mock_/);
  });

  it("rejects at confirmation time when stock was consumed after preview", async () => {
    const preview = await createCheckoutPreview({
      intent: { items: [{ sku: "sql-pro-pack", quantity: 2 }], clarificationNeeded: false },
    });
    expect(preview.kind).toBe("approved");

    // Another buyer takes the remaining stock between preview and confirm.
    await db.catalogItem.updateMany({
      where: { sku: "sql-pro-pack" },
      data: { stock: 0 },
    });

    const callsBefore = mocks.orderCalls.length;
    const confirmed = await confirmCheckout(preview.sessionId);

    expect(confirmed).toMatchObject({ kind: "rejected", code: "OUT_OF_STOCK" });
    expect(mocks.orderCalls.length).toBe(callsBefore); // no order created

    const session = await db.checkoutSession.findUnique({
      where: { id: preview.sessionId },
    });
    expect(session?.status).toBe("REJECTED");
    expect(session?.rejectionReason).toBe("OUT_OF_STOCK");
  });

  it("reuses one active session when the same cart is previewed repeatedly", async () => {
    const intent = {
      items: [{ sku: "sql-pro-pack", quantity: 2 }],
      maxBudgetPaise: 80000,
      clarificationNeeded: false,
    };

    const first = await createCheckoutPreview({ intent });
    const second = await createCheckoutPreview({ intent });

    expect(first.kind).toBe("approved");
    expect(second.kind).toBe("approved");
    if (first.kind !== "approved" || second.kind !== "approved") return;

    expect(second.sessionId).toBe(first.sessionId);
    expect(second.reusedSession).toBe(true);
  });
});

describe("rejected previews are auditable", () => {
  it("records POLICY_REJECTED and creates no order for out-of-stock requests", async () => {
    const callsBefore = mocks.orderCalls.length;
    const preview = await createCheckoutPreview({
      intent: { items: [{ sku: "sold-out-bundle", quantity: 1 }], clarificationNeeded: false },
    });

    expect(preview.kind).toBe("rejected");
    if (preview.kind !== "rejected") return;
    expect(preview.rejection.code).toBe("OUT_OF_STOCK");

    const session = await db.checkoutSession.findUnique({
      where: { id: preview.sessionId },
    });
    expect(session?.status).toBe("REJECTED");
    expect(session?.razorpayOrderId).toBeNull();

    const types = (await getSessionEvents(preview.sessionId)).map((e) => e.eventType);
    expect(types).toContain("INTENT_RECEIVED");
    expect(types).toContain("POLICY_CHECK_STARTED");
    expect(types).toContain("POLICY_REJECTED");
    expect(mocks.orderCalls.length).toBe(callsBefore);
  });
});
