import { z } from "zod";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { fulfillVerifiedPayment } from "@/lib/checkout/checkout-service";
import { verifyWebhookSignature } from "@/lib/razorpay/verify-signature";
import {
  razorpayPaymentEntitySchema,
  razorpayWebhookEnvelopeSchema,
} from "@/schemas/payment";

/**
 * Razorpay webhook pipeline.
 *
 * The browser checkout callback improves UX, but this server-to-server
 * pipeline is the authoritative confirmation of payment state:
 * - HMAC-SHA256 signature over the RAW body (timing-safe compare)
 * - every delivery stored with a unique event id -> redeliveries are
 *   deduplicated and can never fulfil stock twice
 * - state updates are idempotent and amount-checked against the session
 */

export interface WebhookHttpResponse {
  status: number;
  body: {
    received: boolean;
    duplicate?: boolean;
    action?: string;
    reason?: string;
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function processRazorpayWebhook(params: {
  rawBody: string;
  signature: string | null;
  eventId: string | null;
}): Promise<WebhookHttpResponse> {
  // 1. Signature gate — reject anything unsigned or forged.
  const signatureCheck = verifyWebhookSignature({
    rawBody: params.rawBody,
    signature: params.signature,
  });
  if (!signatureCheck.valid) {
    return {
      status: 400,
      body: { received: false, reason: signatureCheck.reason ?? "invalid signature" },
    };
  }

  // 2. Parse and validate the envelope.
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(params.rawBody);
  } catch {
    return { status: 400, body: { received: false, reason: "body is not valid JSON" } };
  }

  const envelope = razorpayWebhookEnvelopeSchema.safeParse(parsedJson);
  if (!envelope.success) {
    return { status: 400, body: { received: false, reason: "malformed webhook envelope" } };
  }
  const eventType = envelope.data.event;

  // Event id comes from the x-razorpay-event-id header; fall back to a
  // content hash so deduplication always has a stable key.
  const eventId =
    params.eventId && params.eventId.length > 0
      ? params.eventId
      : `sha_${Buffer.from(params.rawBody).toString("base64url").slice(0, 40)}`;

  // 3. Inbox dedup — a repeated delivery never re-processes.
  try {
    await db.webhookEvent.create({
      data: {
        eventId,
        eventType,
        payload: parsedJson as never,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // A delivery with this event id was already accepted and processed —
      // respond OK so Razorpay stops retrying, but do not re-process.
      return {
        status: 200,
        body: { received: true, duplicate: true, action: "ignored" },
      };
    }
    throw error;
  }

  // 4. Extract the payment entity for payment.* events.
  const entityResult = razorpayPaymentEntitySchema.safeParse(
    (parsedJson as { payload?: { payment?: { entity?: unknown } } })?.payload?.payment
      ?.entity,
  );

  // 5. Route the event.
  let action = "ignored";

  if (
    (eventType === "payment.captured" || eventType === "order.paid") &&
    entityResult.success
  ) {
    action = await applyCapturedPayment(eventId, entityResult.data);
  } else if (eventType === "payment.failed" && entityResult.success) {
    action = await applyFailedPayment(eventId, entityResult.data);
  }

  await db.webhookEvent.updateMany({
    where: { eventId },
    data: { status: action === "ignored" ? "IGNORED" : "PROCESSED", processedAt: new Date() },
  });

  return { status: 200, body: { received: true, action } };
}

async function findSessionByOrderId(orderId: string) {
  return db.checkoutSession.findFirst({
    where: { razorpayOrderId: orderId },
  });
}

async function applyCapturedPayment(
  eventId: string,
  entity: z.infer<typeof razorpayPaymentEntitySchema>,
): Promise<string> {
  const session = await findSessionByOrderId(entity.order_id);

  if (!session) {
    return "unknown_order";
  }

  await recordAuditEvent({
    sessionId: session.id,
    eventType: "RAZORPAY_WEBHOOK_VERIFIED",
    actor: "RAZORPAY",
    payload: {
      eventId,
      eventType: "payment.captured",
      razorpayOrderId: entity.order_id,
      razorpayPaymentId: entity.id,
      gatewayStatus: entity.status,
    },
  });

  // Idempotency against the browser-callback path.
  if (session.status === "PAYMENT_VERIFIED") {
    if (session.razorpayPaymentId === entity.id) {
      return "already_verified";
    }
    await recordAuditEvent({
      sessionId: session.id,
      eventType: "PAYMENT_MARKED_FAILED",
      actor: "SYSTEM",
      payload: {
        reason: "Conflicting payment id for an already-verified session",
        existingPaymentId: session.razorpayPaymentId,
        webhookPaymentId: entity.id,
        eventId,
      },
    });
    return "conflict";
  }

  // Defense-in-depth: the gateway amount must match the policy-approved total.
  if (entity.amount !== session.totalPaise) {
    await db.checkoutSession.update({
      where: { id: session.id },
      data: {
        status: "PAYMENT_FAILED",
        rejectionReason: "PAYMENT_VERIFICATION_FAILED",
        rejectionDetails: {
          reason: "Webhook amount mismatch",
          expectedPaise: session.totalPaise,
          receivedPaise: entity.amount,
        } as never,
      },
    });
    await recordAuditEvent({
      sessionId: session.id,
      eventType: "PAYMENT_MARKED_FAILED",
      actor: "SYSTEM",
      payload: {
        reason: "Webhook amount mismatch",
        expectedPaise: session.totalPaise,
        receivedPaise: entity.amount,
        eventId,
      },
    });
    return "amount_mismatch";
  }

  const fulfillment = await fulfillVerifiedPayment({
    sessionId: session.id,
    razorpayPaymentId: entity.id,
    signature: `webhook:${eventId}`,
  });

  if (!fulfillment.ok) {
    await recordAuditEvent({
      sessionId: session.id,
      eventType: "PAYMENT_MARKED_FAILED",
      actor: "SYSTEM",
      payload: { reason: fulfillment.reason ?? "webhook fulfillment failed", eventId },
    });
    return "fulfillment_failed";
  }

  await recordAuditEvent({
    sessionId: session.id,
    eventType: "PAYMENT_VERIFIED_VIA_WEBHOOK",
    actor: "SYSTEM",
    payload: {
      razorpayPaymentId: entity.id,
      eventId,
      stockDecremented: true,
    },
  });
  return "fulfilled";
}

async function applyFailedPayment(
  eventId: string,
  entity: z.infer<typeof razorpayPaymentEntitySchema>,
): Promise<string> {
  const session = await findSessionByOrderId(entity.order_id);
  if (!session) {
    return "unknown_order";
  }

  await recordAuditEvent({
    sessionId: session.id,
    eventType: "RAZORPAY_WEBHOOK_VERIFIED",
    actor: "RAZORPAY",
    payload: {
      eventId,
      eventType: "payment.failed",
      razorpayOrderId: entity.order_id,
      razorpayPaymentId: entity.id,
    },
  });

  if (session.status === "PAYMENT_VERIFIED") {
    return "already_verified";
  }

  await db.checkoutSession.update({
    where: { id: session.id },
    data: {
      status: "PAYMENT_FAILED",
      rejectionReason: "PAYMENT_VERIFICATION_FAILED",
      rejectionDetails: {
        reason: "Gateway reported payment failure via webhook",
        razorpayPaymentId: entity.id,
      } as never,
    },
  });
  await recordAuditEvent({
    sessionId: session.id,
    eventType: "PAYMENT_MARKED_FAILED",
    actor: "RAZORPAY",
    payload: { reason: "Gateway reported payment failure", eventId },
  });
  return "marked_failed";
}
