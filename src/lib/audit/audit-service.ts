import { z } from "zod";
import { db } from "@/lib/db";
import { computeEventHash, verifyHashChain } from "@/lib/audit/hash-chain";
import type { ChainVerificationResult } from "@/lib/audit/hash-chain";

export const AUDIT_ACTORS = [
  "BUYER",
  "AGENT",
  "POLICY_ENGINE",
  "SYSTEM",
  "RAZORPAY",
] as const;

export const auditActorSchema = z.enum(AUDIT_ACTORS);
export type AuditActor = (typeof AUDIT_ACTORS)[number];

export const AUDIT_EVENT_TYPES = [
  "INTENT_RECEIVED",
  "INTENT_PARSED",
  "INTENT_PARSE_FAILED",
  "POLICY_CHECK_STARTED",
  "POLICY_APPROVED",
  "POLICY_REJECTED",
  "CHECKOUT_PREVIEW_CREATED",
  "BUYER_CONFIRMED",
  "DUPLICATE_SESSION_REUSED",
  "RAZORPAY_ORDER_CREATE_STARTED",
  "RAZORPAY_ORDER_CREATED",
  "RAZORPAY_ORDER_CREATION_FAILED",
  "CHECKOUT_OPENED",
  "PAYMENT_CALLBACK_RECEIVED",
  "PAYMENT_SIGNATURE_VERIFIED",
  "PAYMENT_SIGNATURE_REJECTED",
  "PAYMENT_MARKED_FAILED",
  "RAZORPAY_WEBHOOK_VERIFIED",
  "RAZORPAY_WEBHOOK_REJECTED",
  "WEBHOOK_EVENT_DUPLICATE",
  "PAYMENT_VERIFIED_VIA_WEBHOOK",
] as const;

export const auditEventTypeSchema = z.enum(AUDIT_EVENT_TYPES);
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

/** Human-readable summaries rendered in the timeline. */
export const AUDIT_EVENT_SUMMARIES: Record<AuditEventType, string> = {
  INTENT_RECEIVED: "Buyer request received",
  INTENT_PARSED: "Request parsed into structured intent",
  INTENT_PARSE_FAILED: "Request could not be parsed safely",
  POLICY_CHECK_STARTED: "Deterministic policy checks started",
  POLICY_APPROVED: "Policy engine approved the cart",
  POLICY_REJECTED: "Policy engine rejected the request",
  CHECKOUT_PREVIEW_CREATED: "Checkout preview created for buyer review",
  BUYER_CONFIRMED: "Buyer explicitly confirmed checkout",
  DUPLICATE_SESSION_REUSED: "Existing secure checkout reused; no duplicate order created",
  RAZORPAY_ORDER_CREATE_STARTED: "Creating Razorpay test order",
  RAZORPAY_ORDER_CREATED: "Razorpay test order created",
  RAZORPAY_ORDER_CREATION_FAILED: "Razorpay order creation failed",
  CHECKOUT_OPENED: "Razorpay checkout handed to buyer",
  PAYMENT_CALLBACK_RECEIVED: "Payment callback received from checkout",
  PAYMENT_SIGNATURE_VERIFIED: "Payment signature verified server-side",
  PAYMENT_SIGNATURE_REJECTED: "Payment signature failed verification",
  PAYMENT_MARKED_FAILED: "Payment marked as failed; no fulfillment",
  RAZORPAY_WEBHOOK_VERIFIED: "Razorpay webhook received with valid signature",
  RAZORPAY_WEBHOOK_REJECTED: "Webhook rejected — signature verification failed",
  WEBHOOK_EVENT_DUPLICATE: "Duplicate webhook delivery ignored (already processed)",
  PAYMENT_VERIFIED_VIA_WEBHOOK: "Payment verified and fulfilled via webhook pipeline",
};

export interface RecordAuditEventInput {
  sessionId: string;
  eventType: AuditEventType;
  actor: AuditActor;
  payload?: Record<string, unknown>;
}

/**
 * Append an event to the session's hash chain. The previous hash is read
 * inside a transaction so concurrent writers cannot fork the chain.
 */
export async function recordAuditEvent(
  input: RecordAuditEventInput,
): Promise<{ id: string; eventHash: string }> {
  const payload = sanitizePayload(input.payload ?? {});

  return db.$transaction(async (tx) => {
    const lastEvent = await tx.auditEvent.findFirst({
      where: { sessionId: input.sessionId },
      orderBy: { createdAt: "desc" },
      select: { eventHash: true },
    });

    const previousHash = lastEvent?.eventHash ?? null;
    const eventHash = computeEventHash(previousHash, {
      sessionId: input.sessionId,
      eventType: input.eventType,
      actor: input.actor,
      payload,
    });

    const created = await tx.auditEvent.create({
      data: {
        sessionId: input.sessionId,
        eventType: input.eventType,
        actor: input.actor,
        payload: payload as never,
        previousHash,
        eventHash,
      },
      select: { id: true, eventHash: true },
    });

    return created;
  });
}

/**
 * Defense-in-depth: strip anything that looks like a credential before it
 * reaches the audit store. Callers must already avoid logging secrets.
 */
function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const forbidden = /secret|apikey|api_key|authorization|password|token/i;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (forbidden.test(key)) {
      clean[key] = "[redacted]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      clean[key] = sanitizePayload(value as Record<string, unknown>);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export async function getSessionEvents(sessionId: string) {
  return db.auditEvent.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });
}

export async function verifySessionChain(
  sessionId: string,
): Promise<ChainVerificationResult> {
  const events = await getSessionEvents(sessionId);
  return verifyHashChain(events);
}
