import { db } from "@/lib/db";
import { formatPaise } from "@/lib/money";
import { hashCart } from "@/lib/checkout/cart-hash";
import {
  evaluatePolicy,
  getPolicyConfig,
} from "@/lib/checkout/policy-engine";
import type { PolicyRejection } from "@/lib/checkout/policy-engine";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import {
  ACTIVE_SESSION_STATUSES,
  sessionStatusSchema,
} from "@/schemas/checkout";
import type { SessionStatus } from "@/schemas/checkout";
import type { PurchaseIntent, RejectionCode } from "@/schemas/agent";
import { createRazorpayOrderForSession } from "@/lib/razorpay/service";
import type { RazorpayOrderInfo } from "@/lib/razorpay/service";
import { verifyRazorpaySignature } from "@/lib/razorpay/verify-signature";

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export interface PreviewItem {
  sku: string;
  itemName: string;
  unitPricePaise: number;
  formattedUnitPrice: string;
  quantity: number;
  lineTotalPaise: number;
  formattedLineTotal: string;
}

export type PreviewOutcome =
  | {
      kind: "approved";
      sessionId: string;
      cartHash: string;
      items: PreviewItem[];
      totalPaise: number;
      formattedTotal: string;
      budgetPaise: number | null;
      remainingBudgetPaise: number | null;
      policyExplanation: string[];
      reusedSession: boolean;
    }
  | {
      kind: "rejected";
      sessionId: string;
      rejection: PolicyRejection;
    };

/**
 * Turn a validated purchase intent into a transparent checkout preview.
 * Creates (or reuses) a session in AWAITING_CONFIRMATION, or records a
 * deterministic rejection. No Razorpay order is ever created here.
 */
export async function createCheckoutPreview(params: {
  intent: PurchaseIntent;
  sourceMessage?: string;
}): Promise<PreviewOutcome> {
  const { intent } = params;

  const policyResult = await evaluatePolicy(intent);
  const cartHash = hashCart({
    items: intent.items,
    maxBudgetPaise: intent.maxBudgetPaise ?? null,
  });

  if (!policyResult.ok) {
    // Best-effort attempted value, computed server-side from catalog prices,
    // powers the "revenue protected" metric.
    const skus = intent.items.map((item) => item.sku);
    const catalogItems = await db.catalogItem.findMany({
      where: { sku: { in: skus } },
      select: { sku: true, pricePaise: true },
    });
    const priceBySku = new Map(catalogItems.map((item) => [item.sku, item.pricePaise]));
    const attemptedTotalPaise = intent.items.reduce(
      (sum, item) => sum + (priceBySku.get(item.sku) ?? 0) * item.quantity,
      0,
    );

    const session = await db.checkoutSession.create({
      data: {
        cartHash,
        status: "REJECTED",
        totalPaise: 0,
        buyerBudgetPaise: intent.maxBudgetPaise ?? null,
        rejectionReason: policyResult.code,
        rejectionDetails: {
          message: policyResult.message,
          suggestedAction: policyResult.suggestedAction,
          details: policyResult.details,
          attemptedTotalPaise,
        } as never,
        idempotencyKey: crypto.randomUUID(),
      },
    });

    await recordAuditEvent({
      sessionId: session.id,
      eventType: "INTENT_RECEIVED",
      actor: "BUYER",
      payload: {
        sourceMessage: params.sourceMessage ?? null,
        itemCount: intent.items.length,
      },
    });
    await recordAuditEvent({
      sessionId: session.id,
      eventType: "POLICY_CHECK_STARTED",
      actor: "POLICY_ENGINE",
      payload: { rules: ["sku_exists", "item_active", "stock", "limits", "budget"] },
    });
    await recordAuditEvent({
      sessionId: session.id,
      eventType: "POLICY_REJECTED",
      actor: "POLICY_ENGINE",
      payload: {
        code: policyResult.code,
        message: policyResult.message,
        suggestedAction: policyResult.suggestedAction,
        details: policyResult.details,
      },
    });

    return { kind: "rejected", sessionId: session.id, rejection: policyResult };
  }

  // Approved path — reuse an existing active session with the same cart
  // instead of stacking duplicates.
  const existing = await db.checkoutSession.findFirst({
    where: {
      cartHash,
      status: { in: [...ACTIVE_SESSION_STATUSES] },
    },
    orderBy: { createdAt: "desc" },
  });

  let sessionId: string;
  let reusedSession = false;

  if (existing) {
    sessionId = existing.id;
    reusedSession = true;
  } else {
    const catalogIds = new Map<string, string>();
    for (const line of policyResult.lines) {
      catalogIds.set(line.sku, await resolveCatalogItemId(line.sku));
    }

    const created = await db.$transaction(async (tx) => {
      const session = await tx.checkoutSession.create({
        data: {
          cartHash,
          status: "AWAITING_CONFIRMATION",
          totalPaise: policyResult.totalPaise,
          currency: "INR",
          buyerBudgetPaise: policyResult.buyerBudgetPaise,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      await tx.checkoutItem.createMany({
        data: policyResult.lines.map((line) => ({
          sessionId: session.id,
          catalogItemId: catalogIds.get(line.sku) ?? "",
          sku: line.sku,
          itemName: line.itemName,
          unitPricePaise: line.unitPricePaise,
          quantity: line.quantity,
          lineTotalPaise: line.lineTotalPaise,
        })),
      });
      return session;
    });
    sessionId = created.id;
  }

  await recordAuditEvent({
    sessionId,
    eventType: "INTENT_RECEIVED",
    actor: "BUYER",
    payload: {
      sourceMessage: params.sourceMessage ?? null,
      itemCount: intent.items.length,
    },
  });
  await recordAuditEvent({
    sessionId,
    eventType: "POLICY_CHECK_STARTED",
    actor: "POLICY_ENGINE",
    payload: { rules: ["sku_exists", "item_active", "stock", "limits", "budget"] },
  });
  await recordAuditEvent({
    sessionId,
    eventType: "POLICY_APPROVED",
    actor: "POLICY_ENGINE",
    payload: {
      totalPaise: policyResult.totalPaise,
      totalUnits: policyResult.totalUnits,
      budgetPaise: policyResult.buyerBudgetPaise,
    },
  });
  await recordAuditEvent({
    sessionId,
    eventType: "CHECKOUT_PREVIEW_CREATED",
    actor: "SYSTEM",
    payload: {
      totalPaise: policyResult.totalPaise,
      awaitingConfirmation: true,
      reusedSession,
    },
  });

  const items: PreviewItem[] = policyResult.lines.map((line) => ({
    sku: line.sku,
    itemName: line.itemName,
    unitPricePaise: line.unitPricePaise,
    formattedUnitPrice: formatPaise(line.unitPricePaise),
    quantity: line.quantity,
    lineTotalPaise: line.lineTotalPaise,
    formattedLineTotal: formatPaise(line.lineTotalPaise),
  }));

  return {
    kind: "approved",
    sessionId,
    cartHash,
    items,
    totalPaise: policyResult.totalPaise,
    formattedTotal: formatPaise(policyResult.totalPaise),
    budgetPaise: policyResult.buyerBudgetPaise,
    remainingBudgetPaise:
      policyResult.buyerBudgetPaise !== null
        ? policyResult.buyerBudgetPaise - policyResult.totalPaise
        : null,
    policyExplanation: policyResult.explanations,
    reusedSession,
  };
}

async function resolveCatalogItemId(sku: string): Promise<string> {
  const item = await db.catalogItem.findUnique({ where: { sku }, select: { id: true } });
  if (!item) {
    throw new Error(`Catalog item missing during session creation: ${sku}`);
  }
  return item.id;
}

// ---------------------------------------------------------------------------
// Confirm
// ---------------------------------------------------------------------------

export type ConfirmOutcome =
  | {
      kind: "order_created";
      sessionId: string;
      razorpay: RazorpayOrderInfo;
      reused: boolean;
    }
  | {
      kind: "rejected";
      sessionId: string;
      code: RejectionCode;
      message: string;
      suggestedAction: string;
    }
  | {
      kind: "error";
      code: RejectionCode;
      message: string;
    };

/**
 * Explicit buyer confirmation gate. Re-runs every policy check against live
 * inventory before creating a Razorpay test-mode Order, and reuses any
 * existing active session/order for the same cart (duplicate protection).
 */
export async function confirmCheckout(sessionId: string): Promise<ConfirmOutcome> {
  const session = await db.checkoutSession.findUnique({
    where: { id: sessionId },
    include: { items: true },
  });

  if (!session) {
    return {
      kind: "error",
      code: "INVALID_INTENT",
      message: "Checkout session not found. Please start a new request.",
    };
  }

  // Duplicate protection: an active session with a live order is returned
  // as-is instead of creating a second Razorpay Order.
  if (
    (session.status === "ORDER_CREATED" || session.status === "PAYMENT_PENDING") &&
    session.razorpayOrderId
  ) {
    await recordAuditEvent({
      sessionId: session.id,
      eventType: "DUPLICATE_SESSION_REUSED",
      actor: "SYSTEM",
      payload: { razorpayOrderId: session.razorpayOrderId },
    });
    return {
      kind: "order_created",
      sessionId: session.id,
      razorpay: await buildRazorpayInfo(session.razorpayOrderId, session),
      reused: true,
    };
  }

  const status = sessionStatusSchema.safeParse(session.status);
  if (!status.success || status.data !== "AWAITING_CONFIRMATION") {
    return {
      kind: "error",
      code: "CONFIRMATION_REQUIRED",
      message: `This checkout session is ${session.status.toLowerCase()} and cannot be confirmed.`,
    };
  }

  await recordAuditEvent({
    sessionId: session.id,
    eventType: "BUYER_CONFIRMED",
    actor: "BUYER",
    payload: {
      confirmedAt: new Date().toISOString(),
      totalPaise: session.totalPaise,
    },
  });

  // Rebuild the intent from persisted server-side data only.
  const intent: PurchaseIntent = {
    items: session.items.map((item) => ({ sku: item.sku, quantity: item.quantity })),
    maxBudgetPaise: session.buyerBudgetPaise ?? undefined,
    clarificationNeeded: false,
  };

  const policyResult = await evaluatePolicy(intent);
  if (!policyResult.ok) {
    await db.checkoutSession.update({
      where: { id: session.id },
      data: {
        status: "REJECTED",
        rejectionReason: policyResult.code,
        rejectionDetails: {
          message: policyResult.message,
          suggestedAction: policyResult.suggestedAction,
          details: policyResult.details,
        } as never,
      },
    });
    await recordAuditEvent({
      sessionId: session.id,
      eventType: "POLICY_REJECTED",
      actor: "POLICY_ENGINE",
      payload: {
        stage: "confirm_recheck",
        code: policyResult.code,
        message: policyResult.message,
      },
    });
    return {
      kind: "rejected",
      sessionId: session.id,
      code: policyResult.code,
      message: policyResult.message,
      suggestedAction: policyResult.suggestedAction,
    };
  }

  // Atomic claim: flip AWAITING_CONFIRMATION -> ORDER_CREATED exactly once.
  // Concurrent confirmations lose this race and fall through to reuse.
  const claim = await db.checkoutSession.updateMany({
    where: { id: session.id, status: "AWAITING_CONFIRMATION" },
    data: { status: "ORDER_CREATED" },
  });

  if (claim.count === 0) {
    const current = await db.checkoutSession.findUnique({ where: { id: session.id } });
    if (
      current &&
      (current.status === "ORDER_CREATED" || current.status === "PAYMENT_PENDING") &&
      current.razorpayOrderId
    ) {
      await recordAuditEvent({
        sessionId: session.id,
        eventType: "DUPLICATE_SESSION_REUSED",
        actor: "SYSTEM",
        payload: { razorpayOrderId: current.razorpayOrderId, stage: "confirm_race" },
      });
      return {
        kind: "order_created",
        sessionId: session.id,
        razorpay: await buildRazorpayInfo(current.razorpayOrderId, current),
        reused: true,
      };
    }
    return {
      kind: "error",
      code: "CONFIRMATION_REQUIRED",
      message: `This checkout session is ${current?.status.toLowerCase() ?? "unknown"} and cannot be confirmed.`,
    };
  }

  const policy = await getPolicyConfig();
  if (policy.confirmationRequired !== true) {
    // Defensive: the seeded policy always requires confirmation today.
    await revertClaim(session.id);
    return {
      kind: "error",
      code: "CONFIRMATION_REQUIRED",
      message: "Merchant policy configuration is invalid.",
    };
  }

  try {
    const razorpay = await createRazorpayOrderForSession(session.id);

    await recordAuditEvent({
      sessionId: session.id,
      eventType: "CHECKOUT_OPENED",
      actor: "SYSTEM",
      payload: {
        razorpayOrderId: razorpay.orderId,
        handedToClient: true,
      },
    });

    return {
      kind: "order_created",
      sessionId: session.id,
      razorpay,
      reused: false,
    };
  } catch (error) {
    // Release the claim so the buyer can retry confirmation.
    await revertClaim(session.id);
    const isRazorpayError =
      typeof error === "object" &&
      error !== null &&
      "publicMessage" in error &&
      typeof (error as { publicMessage: unknown }).publicMessage === "string";
    if (isRazorpayError) {
      return {
        kind: "error",
        code: "RAZORPAY_ORDER_CREATION_FAILED",
        message: (error as { publicMessage: string }).publicMessage,
      };
    }
    return {
      kind: "error",
      code: "RAZORPAY_ORDER_CREATION_FAILED",
      message:
        error instanceof Error && error.message.includes("not configured")
          ? "Demo payment mode unavailable — Razorpay keys are not configured on this server."
          : "Could not create the payment order. No charge has been made. Please try again.",
    };
  }
}

/** Release a failed confirmation claim back to AWAITING_CONFIRMATION. */
async function revertClaim(sessionId: string): Promise<void> {
  await db.checkoutSession.updateMany({
    where: { id: sessionId, status: "ORDER_CREATED" },
    data: { status: "AWAITING_CONFIRMATION" },
  });
}

async function buildRazorpayInfo(
  orderId: string,
  session: { totalPaise: number; currency: string },
): Promise<RazorpayOrderInfo> {
  const policy = await getPolicyConfig();
  return {
    orderId,
    amountPaise: session.totalPaise,
    currency: session.currency,
    keyId: process.env.RAZORPAY_KEY_ID ?? "",
    merchantName: policy.merchantName,
    receipt: `ap_${orderId.replace(/[^a-zA-Z0-9]/g, "").slice(-14).toLowerCase()}`,
    testMode: true,
  };
}

// ---------------------------------------------------------------------------
// Payment verification
// ---------------------------------------------------------------------------

export type VerifyOutcome =
  | {
      verified: true;
      sessionId: string;
      status: SessionStatus;
      razorpayPaymentId: string;
    }
  | {
      verified: false;
      sessionId: string;
      status: SessionStatus;
      code: RejectionCode;
      message: string;
    };

/**
 * Server-side payment verification. A payment becomes PAYMENT_VERIFIED only
 * after its signature passes HMAC verification; stock is decremented in the
 * same transaction that marks fulfillment.
 */
export async function verifyPayment(params: {
  checkoutSessionId: string;
  razorpayPaymentId: string;
  razorpayOrderId: string;
  signature: string;
}): Promise<VerifyOutcome> {
  const session = await db.checkoutSession.findUnique({
    where: { id: params.checkoutSessionId },
    include: { items: true },
  });

  if (!session) {
    return {
      verified: false,
      sessionId: params.checkoutSessionId,
      status: "PAYMENT_FAILED",
      code: "PAYMENT_VERIFICATION_FAILED",
      message: "Checkout session not found.",
    };
  }

  await recordAuditEvent({
    sessionId: session.id,
    eventType: "PAYMENT_CALLBACK_RECEIVED",
    actor: "RAZORPAY",
    payload: {
      razorpayOrderId: params.razorpayOrderId,
      razorpayPaymentId: params.razorpayPaymentId,
    },
  });

  // Idempotent success: already verified sessions stay verified.
  if (
    session.status === "PAYMENT_VERIFIED" &&
    session.razorpayPaymentId === params.razorpayPaymentId
  ) {
    return {
      verified: true,
      sessionId: session.id,
      status: "PAYMENT_VERIFIED",
      razorpayPaymentId: session.razorpayPaymentId,
    };
  }

  // The callback must reference the order this session actually created.
  if (!session.razorpayOrderId || session.razorpayOrderId !== params.razorpayOrderId) {
    await markPaymentFailed(session.id, "PAYMENT_SIGNATURE_INVALID", "Order id mismatch");
    return {
      verified: false,
      sessionId: session.id,
      status: "PAYMENT_FAILED",
      code: "PAYMENT_SIGNATURE_INVALID",
      message: "Payment does not match this checkout session.",
    };
  }

  const signatureCheck = verifyRazorpaySignature({
    razorpayOrderId: params.razorpayOrderId,
    razorpayPaymentId: params.razorpayPaymentId,
    signature: params.signature,
  });

  if (!signatureCheck.valid) {
    await markPaymentFailed(
      session.id,
      "PAYMENT_SIGNATURE_INVALID",
      signatureCheck.reason ?? "Signature verification failed",
    );
    return {
      verified: false,
      sessionId: session.id,
      status: "PAYMENT_FAILED",
      code: "PAYMENT_SIGNATURE_INVALID",
      message: "Payment signature verification failed. No fulfillment occurred.",
    };
  }

  const fulfillment = await fulfillVerifiedPayment({
    sessionId: session.id,
    razorpayPaymentId: params.razorpayPaymentId,
    signature: params.signature,
  });

  if (!fulfillment.ok) {
    await markPaymentFailed(
      session.id,
      "PAYMENT_VERIFICATION_FAILED",
      fulfillment.reason ?? "Fulfillment transaction failed",
    );
    return {
      verified: false,
      sessionId: session.id,
      status: "PAYMENT_FAILED",
      code: "PAYMENT_VERIFICATION_FAILED",
      message: "Payment could not be fulfilled safely. No items were reserved.",
    };
  }

  await recordAuditEvent({
    sessionId: session.id,
    eventType: "PAYMENT_SIGNATURE_VERIFIED",
    actor: "SYSTEM",
    payload: {
      razorpayOrderId: params.razorpayOrderId,
      razorpayPaymentId: params.razorpayPaymentId,
      fulfilledUnits: session.items.reduce((sum, item) => sum + item.quantity, 0),
    },
  });

  return {
    verified: true,
    sessionId: session.id,
    status: "PAYMENT_VERIFIED",
    razorpayPaymentId: params.razorpayPaymentId,
  };
}

export interface FulfillmentResult {
  ok: boolean;
  reason?: string;
}

/**
 * Atomically mark a payment verified and decrement stock.
 *
 * Shared by the browser-callback verification path and the webhook pipeline:
 * guarded stock decrements + status transition happen in one transaction that
 * rolls back completely if any line can no longer be fulfilled. Safe to call
 * at most once per (session, paymentId); callers must handle idempotency.
 */
export async function fulfillVerifiedPayment(params: {
  sessionId: string;
  razorpayPaymentId: string;
  signature: string;
}): Promise<FulfillmentResult> {
  const session = await db.checkoutSession.findUnique({
    where: { id: params.sessionId },
    include: { items: true },
  });
  if (!session) {
    return { ok: false, reason: "Checkout session not found" };
  }

  try {
    await db.$transaction(async (tx) => {
      // Guarded stock decrement — rolls back if any line lost its race.
      for (const item of session.items) {
        const updated = await tx.catalogItem.updateMany({
          where: { sku: item.sku, stock: { gte: item.quantity }, active: true },
          data: { stock: { decrement: item.quantity } },
        });
        if (updated.count !== 1) {
          throw new Error(`Insufficient stock at fulfillment for ${item.sku}`);
        }
      }

      await tx.checkoutSession.update({
        where: { id: session.id },
        data: {
          status: "PAYMENT_VERIFIED",
          razorpayPaymentId: params.razorpayPaymentId,
          razorpaySignature: params.signature,
        },
      });
    });

    // Close the loop on any linked recovery case (original or replacement
    // session). Dynamic import avoids a module cycle with recovery-service.
    const { markRecoveredIfLinked } = await import("@/lib/recovery/recovery-service");
    await markRecoveredIfLinked(session.id, session.totalPaise);

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Fulfillment transaction failed",
    };
  }
}

async function markPaymentFailed(
  sessionId: string,
  code: RejectionCode,
  reason: string,
): Promise<void> {
  await db.checkoutSession.update({
    where: { id: sessionId },
    data: {
      status: "PAYMENT_FAILED",
      rejectionReason: code,
      rejectionDetails: { reason } as never,
    },
  });
  await recordAuditEvent({
    sessionId,
    eventType: "PAYMENT_SIGNATURE_REJECTED",
    actor: "SYSTEM",
    payload: { code, reason },
  });
  await recordAuditEvent({
    sessionId,
    eventType: "PAYMENT_MARKED_FAILED",
    actor: "SYSTEM",
    payload: { code, reason, fulfillmentOccurred: false },
  });
}
