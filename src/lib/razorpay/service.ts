import { db } from "@/lib/db";
import { getPolicyConfig } from "@/lib/checkout/policy-engine";
import {
  RazorpayApiError,
  isRazorpayConfigured,
  razorpayRequest,
} from "@/lib/razorpay/client";
import { recordAuditEvent } from "@/lib/audit/audit-service";

export interface RazorpayOrderInfo {
  orderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
  merchantName: string;
  receipt: string;
  testMode: true;
}

interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
}

/**
 * Create a Razorpay test-mode Order for a checkout session.
 *
 * Security properties:
 * - Server-side only; receives only a validated session ID.
 * - Amount comes exclusively from the persisted session total, which was
 *   computed by the policy engine from database prices.
 * - Stock is NOT decremented here — only after signature verification.
 */
export async function createRazorpayOrderForSession(
  sessionId: string,
): Promise<RazorpayOrderInfo> {
  if (!isRazorpayConfigured()) {
    throw new RazorpayApiError(
      0,
      "Razorpay credentials are not configured",
      "Demo payment mode unavailable — Razorpay keys are not configured on this server.",
    );
  }

  const session = await db.checkoutSession.findUnique({
    where: { id: sessionId },
    include: { items: true },
  });

  if (!session) {
    throw new Error(`Checkout session not found: ${sessionId}`);
  }

  const policy = await getPolicyConfig();

  // Receipt must be short, unique and lowercase alphanumeric.
  const receipt = `ap_${session.id.replace(/[^a-zA-Z0-9]/g, "").slice(-14).toLowerCase()}`;

  await recordAuditEvent({
    sessionId: session.id,
    eventType: "RAZORPAY_ORDER_CREATE_STARTED",
    actor: "SYSTEM",
    payload: {
      amountPaise: session.totalPaise,
      currency: session.currency,
      receipt,
    },
  });

  let order: RazorpayOrderResponse;
  try {
    order = await razorpayRequest<RazorpayOrderResponse>("/orders", {
      method: "POST",
      body: {
        amount: session.totalPaise,
        currency: session.currency,
        receipt,
        notes: {
          checkoutSessionId: session.id,
          merchantName: policy.merchantName,
          environment: "test",
        },
      },
    });
  } catch (error) {
    const publicMessage =
      error instanceof RazorpayApiError
        ? error.publicMessage
        : "Could not create the payment order. Please try again.";
    await recordAuditEvent({
      sessionId: session.id,
      eventType: "RAZORPAY_ORDER_CREATION_FAILED",
      actor: "RAZORPAY",
      payload: {
        reason: error instanceof Error ? error.message : "unknown error",
        publicMessage,
      },
    });
    throw error;
  }

  await db.checkoutSession.update({
    where: { id: session.id },
    data: {
      status: "ORDER_CREATED",
      razorpayOrderId: order.id,
    },
  });

  await recordAuditEvent({
    sessionId: session.id,
    eventType: "RAZORPAY_ORDER_CREATED",
    actor: "RAZORPAY",
    payload: {
      razorpayOrderId: order.id,
      amountPaise: order.amount,
      currency: order.currency,
      gatewayStatus: order.status,
    },
  });

  return {
    orderId: order.id,
    amountPaise: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID ?? "",
    merchantName: policy.merchantName,
    receipt,
    testMode: true,
  };
}
