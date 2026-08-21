import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import {
  decideIntervention,
  type InterventionDecision,
} from "@/lib/recovery/intervention-engine";
import { getPolicyConfig } from "@/lib/checkout/policy-engine";
import { createCheckoutPreview } from "@/lib/checkout/checkout-service";
import { generateRecoveryCopy } from "@/lib/agent/recovery-copy";
import { formatPaise } from "@/lib/money";
import { MERCHANT_ACTOR } from "@/lib/policy/policy-service";

/**
 * Failed-payment recovery workflow.
 *
 * Every action is simulated in-app, requires explicit merchant approval,
 * respects deterministic stopping rules, and appends to the session's audit
 * chain. No real email/SMS/WhatsApp is ever sent and no payment is ever
 * initiated without the standard buyer confirmation gate.
 */

const MAX_SESSION_AGE_MINUTES = 60 * 24 * 14;

// ---------------------------------------------------------------------------
// Scanning / queue
// ---------------------------------------------------------------------------

interface CandidateRow {
  id: string;
  status: string;
  totalPaise: number;
  buyerBudgetPaise: number | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{ sku: string; itemName: string; quantity: number }>;
}

async function loadCandidates(): Promise<CandidateRow[]> {
  const sessions = await db.checkoutSession.findMany({
    where: {
      status: { in: ["PAYMENT_FAILED", "ORDER_CREATED", "EXPIRED", "REJECTED"] },
      recoveryCase: null,
    },
    include: { items: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return sessions.map((session) => ({
    id: session.id,
    status: session.status,
    totalPaise: session.totalPaise,
    buyerBudgetPaise: session.buyerBudgetPaise,
    rejectionReason: session.rejectionReason,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    items: session.items.map((item) => ({
      sku: item.sku,
      itemName: item.itemName,
      quantity: item.quantity,
    })),
  }));
}

function attemptedValue(row: CandidateRow): number {
  if (row.totalPaise > 0) return row.totalPaise;
  // Rejected sessions carry the would-be value in rejectionDetails.
  void row;
  return 0;
}

async function resolveStockContext(items: Array<{ sku: string; quantity: number }>) {
  const skus = items.map((item) => item.sku);
  const catalogItems = await db.catalogItem.findMany({
    where: { sku: { in: skus.length > 0 ? skus : ["__none__"] } },
  });
  const primary = catalogItems[0] ?? null;
  const inStock =
    catalogItems.length > 0 &&
    catalogItems.every(
      (item) =>
        !item.paused &&
        item.active &&
        item.agentPurchasable &&
        item.stock >= (items.find((i) => i.sku === item.sku)?.quantity ?? 1),
    );

  let alternative: { sku: string; name: string; pricePaise: number } | null = null;
  if (!inStock && primary) {
    const candidates = await db.catalogItem.findMany({
      where: {
        active: true,
        paused: false,
        agentPurchasable: true,
        stock: { gt: 0 },
        sku: { notIn: skus },
      },
      orderBy: { pricePaise: "asc" },
      take: 5,
    });
    const best = candidates
      .filter((candidate) => candidate.pricePaise <= primary.pricePaise)
      .sort((a, b) => b.pricePaise - a.pricePaise)[0];
    if (best) {
      alternative = { sku: best.sku, name: best.name, pricePaise: best.pricePaise };
    }
  }

  return { inStock, alternative };
}

/**
 * Scan checkout sessions for bounded recovery opportunities and open cases.
 * Deterministic: the intervention engine decides; nothing contacts buyers.
 */
export async function scanForRecoveryOpportunities(): Promise<{
  scanned: number;
  created: number;
}> {
  const policy = await getPolicyConfig();
  const candidates = await loadCandidates();
  const now = new Date();

  let created = 0;
  for (const row of candidates) {
    const cartValuePaise = attemptedValue(row);
    if (cartValuePaise <= 0 && row.rejectionReason !== "OUT_OF_STOCK") continue;

    const { inStock, alternative } = await resolveStockContext(row.items);
    const primaryItem = row.items[0];

    const decision = decideIntervention({
      sessionStatus: row.status,
      failureReason: row.rejectionReason,
      cartValuePaise: Math.max(cartValuePaise, alternative?.pricePaise ?? 0),
      productName: primaryItem?.itemName ?? "your selected item",
      inStock,
      alternative,
      attemptCount: 0,
      policy: {
        recoveryEnabled: policy.recoveryEnabled,
        maxRecoveryAttempts: policy.maxRecoveryAttempts,
        coolingOffMinutesAfterFailures: policy.coolingOffMinutesAfterFailures,
      },
      sessionAgeMinutes: Math.floor((now.getTime() - row.createdAt.getTime()) / 60000),
      budgetPaise: row.buyerBudgetPaise,
    });

    if (decision.eligibility !== "ELIGIBLE") continue;

    const existingCount = await db.recoveryCase.count({
      where: { checkoutSessionId: row.id },
    });
    if (existingCount > 0) continue;

    await db.recoveryCase.create({
      data: {
        checkoutSessionId: row.id,
        status: "ELIGIBLE",
        interventionType: decision.interventionType,
        reasonCodes: {
          codes: decision.reasonCodes,
          rule: decision.rule,
          merchantBound: decision.merchantBound,
          opportunityType: decision.opportunityType,
          alternativeSku: alternative?.sku ?? null,
        } as never,
        expectedRecoveryValuePaise: decision.expectedRecoveryValuePaise,
        attemptCount: 0,
        nextEligibleAt: new Date(now.getTime() + decision.cooldownMinutes * 60000),
        policyVersion: policy.policyVersion,
      },
    });

    await recordAuditEvent({
      sessionId: row.id,
      eventType: "REVENUE_OPPORTUNITY_IDENTIFIED",
      actor: "SYSTEM",
      payload: {
        opportunityType: decision.opportunityType,
        expectedRecoveryValuePaise: decision.expectedRecoveryValuePaise,
        rule: decision.rule,
        policyVersion: policy.policyVersion,
      },
    });
    await recordAuditEvent({
      sessionId: row.id,
      eventType: "RECOVERY_CASE_CREATED",
      actor: "SYSTEM",
      payload: {
        interventionType: decision.interventionType,
        reasonCodes: decision.reasonCodes,
        humanExplanation: decision.humanExplanation,
        policyVersion: policy.policyVersion,
      },
    });
    await recordAuditEvent({
      sessionId: row.id,
      eventType: "RECOVERY_PROPOSED",
      actor: "SYSTEM",
      payload: {
        interventionType: decision.interventionType,
        awaitingMerchantApproval: true,
        note: "No buyer contact occurs until a merchant explicitly approves.",
        policyVersion: policy.policyVersion,
      },
    });

    created += 1;
  }

  return { scanned: candidates.length, created };
}

export async function expireStaleRecoveryCases(): Promise<number> {
  const cutoff = new Date(Date.now() - MAX_SESSION_AGE_MINUTES * 60000);
  const stale = await db.recoveryCase.findMany({
    where: {
      status: { in: ["ELIGIBLE", "PROPOSED", "MERCHANT_APPROVED", "ACTION_EXECUTED", "BUYER_REENGAGED"] },
      createdAt: { lt: cutoff },
    },
  });
  for (const recoveryCase of stale) {
    await db.recoveryCase.update({
      where: { id: recoveryCase.id },
      data: { status: "EXPIRED", stoppedReason: "case_window_elapsed" },
    });
    await recordAuditEvent({
      sessionId: recoveryCase.checkoutSessionId,
      eventType: "RECOVERY_EXPIRED",
      actor: "SYSTEM",
      payload: { reason: "case_window_elapsed", policyVersion: recoveryCase.policyVersion },
    });
  }
  return stale.length;
}

export async function getRecoveryQueue() {
  return db.recoveryCase.findMany({
    where: { status: { in: ["ELIGIBLE", "PROPOSED", "MERCHANT_APPROVED", "ACTION_EXECUTED", "BUYER_REENGAGED"] } },
    include: {
      session: { select: { id: true, status: true, totalPaise: true, rejectionReason: true, createdAt: true } },
      actions: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getRecoveryCaseDetail(caseId: string) {
  const recoveryCase = await db.recoveryCase.findUnique({
    where: { id: caseId },
    include: {
      session: { include: { items: true } },
      actions: { orderBy: { createdAt: "desc" } },
    },
  });
  return recoveryCase;
}

// ---------------------------------------------------------------------------
// Merchant approval + simulated execution
// ---------------------------------------------------------------------------

export class RecoveryActionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function approveAndExecuteRecovery(caseId: string): Promise<{
  message: string;
  copyMode: string;
  interventionType: string;
  attemptCount: number;
}> {
  const recoveryCase = await db.recoveryCase.findUnique({
    where: { id: caseId },
    include: { session: { include: { items: true } } },
  });
  if (!recoveryCase) {
    throw new RecoveryActionError("NOT_FOUND", "Recovery case not found.");
  }

  // Stopping rules — enforced again at execution time, never trusted from UI.
  if (recoveryCase.status === "STOPPED" || recoveryCase.status === "EXPIRED") {
    throw new RecoveryActionError("CASE_CLOSED", "This recovery case is closed and cannot be resumed.");
  }
  if (recoveryCase.status === "RECOVERED") {
    throw new RecoveryActionError("ALREADY_RECOVERED", "This case already completed.");
  }

  const policy = await getPolicyConfig();
  if (!policy.recoveryEnabled) {
    throw new RecoveryActionError("RECOVERY_DISABLED", "Merchant policy has disabled recovery.");
  }
  if (recoveryCase.attemptCount >= policy.maxRecoveryAttempts) {
    throw new RecoveryActionError("MAX_ATTEMPTS", `Stopping rule: maximum ${policy.maxRecoveryAttempts} recovery attempts reached.`);
  }

  const session = recoveryCase.session;
  const stockContext = await resolveStockContext(
    session.items.map((item) => ({ sku: item.sku, quantity: item.quantity })),
  );
  const inStock = stockContext.inStock;
  const needsStock =
    recoveryCase.interventionType === "SEND_PAYMENT_REMINDER" ||
    recoveryCase.interventionType === "RESUME_CHECKOUT";
  if (needsStock && !inStock) {
    throw new RecoveryActionError("NO_STOCK", "Inventory can no longer satisfy this request; recovery is blocked.");
  }

  const decision: InterventionDecision = {
    interventionType: recoveryCase.interventionType as InterventionDecision["interventionType"],
    eligibility: "ELIGIBLE",
    reasonCodes:
      ((recoveryCase.reasonCodes as { codes?: string[] })?.codes ?? []) as string[],
    humanExplanation: "",
    recommendedMessage: "",
    cooldownMinutes: policy.coolingOffMinutesAfterFailures,
    expectedRecoveryValuePaise: recoveryCase.expectedRecoveryValuePaise,
    rule: ((recoveryCase.reasonCodes as { rule?: string })?.rule) ?? "persisted_decision",
    merchantBound: ((recoveryCase.reasonCodes as { merchantBound?: string })?.merchantBound) ?? "",
    opportunityType: "Not applicable",
  };

  const primaryItem = session.items[0];
  const intentSummary = await getBuyerRequestSummary(session.id);

  const copy = await generateRecoveryCopy({
    decision,
    productName: primaryItem?.itemName ?? "your selected item",
    unitPricePaise: primaryItem?.unitPricePaise ?? session.totalPaise,
    merchantName: policy.merchantName,
    buyerRequestSummary: intentSummary,
  });

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.recoveryCase.update({
      where: { id: caseId },
      data: {
        status: "ACTION_EXECUTED",
        attemptCount: { increment: 1 },
        nextEligibleAt: new Date(now.getTime() + policy.coolingOffMinutesAfterFailures * 60000),
      },
    });
    await tx.recoveryAction.create({
      data: {
        recoveryCaseId: caseId,
        actionType: decision.interventionType,
        messagePreview: copy.message,
        copyMode: copy.mode,
        copyVersion: copy.copyVersion,
        approvedBy: MERCHANT_ACTOR,
        executedAt: now,
        result: "simulated_delivery",
        metadata: {
          reasonCodes: copy.reasonCodes,
          rule: decision.rule,
          merchantBound: decision.merchantBound,
          expectedRecoveryValuePaise: recoveryCase.expectedRecoveryValuePaise,
          policyVersion: policy.policyVersion,
          alternativeSku:
            ((recoveryCase.reasonCodes as { alternativeSku?: string })?.alternativeSku) ?? null,
          simulated: true,
        } as never,
      },
    });
  });

  await recordAuditEvent({
    sessionId: session.id,
    eventType: "RECOVERY_APPROVED",
    actor: "MERCHANT",
    payload: {
      recoveryCaseId: caseId,
      approvedBy: MERCHANT_ACTOR,
      interventionType: decision.interventionType,
      policyVersion: policy.policyVersion,
      reasonCodes: copy.reasonCodes,
    },
  });
  await recordAuditEvent({
    sessionId: session.id,
    eventType: "RECOVERY_EXECUTED",
    actor: "SYSTEM",
    payload: {
      recoveryCaseId: caseId,
      actionType: decision.interventionType,
      simulated: true,
      copyMode: copy.mode,
      copyVersion: copy.copyVersion,
      attemptCount: recoveryCase.attemptCount + 1,
      note: "Simulated in-app delivery. No email/SMS/WhatsApp was sent and no payment was initiated.",
      policyVersion: policy.policyVersion,
    },
  });

  return {
    message: copy.message,
    copyMode: copy.mode,
    interventionType: decision.interventionType,
    attemptCount: recoveryCase.attemptCount + 1,
  };
}

async function getBuyerRequestSummary(sessionId: string): Promise<string> {
  const intentEvent = await db.auditEvent.findFirst({
    where: { sessionId, eventType: "INTENT_RECEIVED" },
    orderBy: { createdAt: "asc" },
  });
  const sourceMessage =
    (intentEvent?.payload as { sourceMessage?: string } | null)?.sourceMessage ?? undefined;
  return sourceMessage ?? "Checkout prepared via AgentPay agent";
}

// ---------------------------------------------------------------------------
// Buyer-side actions on /recover/[caseId]
// ---------------------------------------------------------------------------

export async function declineRecovery(caseId: string): Promise<void> {
  const recoveryCase = await db.recoveryCase.findUnique({ where: { id: caseId } });
  if (!recoveryCase) {
    throw new RecoveryActionError("NOT_FOUND", "Recovery case not found.");
  }
  if (recoveryCase.status === "STOPPED" || recoveryCase.status === "RECOVERED" || recoveryCase.status === "EXPIRED") {
    throw new RecoveryActionError("CASE_CLOSED", "This recovery case is already closed.");
  }

  await db.recoveryCase.update({
    where: { id: caseId },
    data: { status: "STOPPED", stoppedReason: "buyer_declined" },
  });
  await recordAuditEvent({
    sessionId: recoveryCase.checkoutSessionId,
    eventType: "RECOVERY_STOPPED",
    actor: "BUYER",
    payload: { recoveryCaseId: caseId, reason: "buyer_declined", policyVersion: recoveryCase.policyVersion },
  });
}

export async function acceptAlternativeOffer(caseId: string): Promise<{ sessionId: string }> {
  const recoveryCase = await db.recoveryCase.findUnique({
    where: { id: caseId },
    include: {
      session: { include: { items: true } },
      actions: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!recoveryCase) {
    throw new RecoveryActionError("NOT_FOUND", "Recovery case not found.");
  }
  if (recoveryCase.status !== "ACTION_EXECUTED" && recoveryCase.status !== "BUYER_REENGAGED") {
    throw new RecoveryActionError("NOT_ACTIONED", "No recovery offer has been approved for this case yet.");
  }
  if (recoveryCase.interventionType !== "OFFER_LOWER_PRICED_ALTERNATIVE") {
    throw new RecoveryActionError("NO_ALTERNATIVE", "This case does not include an alternative-product offer.");
  }

  const codes = (recoveryCase.reasonCodes as { codes?: string[] }).codes ?? [];
  void codes;
  const metadataLastAction = recoveryCase.actions[0]?.metadata as
    | { alternativeSku?: string }
    | undefined;

  // The offered alternative is resolved deterministically again now — stock
  // and eligibility are re-checked through the normal policy pipeline.
  const { alternative } = await resolveStockContext(
    recoveryCase.session.items.map((item) => ({ sku: item.sku, quantity: item.quantity })),
  );
  const altSku = alternative?.sku ?? metadataLastAction?.alternativeSku;
  if (!altSku) {
    throw new RecoveryActionError("NO_STOCK", "The alternative is no longer available.");
  }

  const originalQuantity = recoveryCase.session.items[0]?.quantity ?? 1;
  const preview = await createCheckoutPreview({
    intent: {
      items: [{ sku: altSku, quantity: originalQuantity }],
      maxBudgetPaise: recoveryCase.session.buyerBudgetPaise ?? undefined,
      clarificationNeeded: false,
    },
    sourceMessage: `Recovery alternative for session ${recoveryCase.checkoutSessionId}`,
  });

  if (preview.kind === "rejected") {
    throw new RecoveryActionError("POLICY_REJECTED", preview.rejection.message);
  }

  await db.recoveryCase.update({
    where: { id: caseId },
    data: { status: "BUYER_REENGAGED", replacementSessionId: preview.sessionId },
  });

  await recordAuditEvent({
    sessionId: recoveryCase.checkoutSessionId,
    eventType: "ALTERNATIVE_PRODUCT_OFFERED",
    actor: "BUYER",
    payload: {
      recoveryCaseId: caseId,
      acceptedAlternativeSku: altSku,
      newSessionId: preview.sessionId,
      policyVersion: recoveryCase.policyVersion,
    },
  });
  await recordAuditEvent({
    sessionId: recoveryCase.checkoutSessionId,
    eventType: "RECOVERY_BUYER_REENGAGED",
    actor: "BUYER",
    payload: {
      recoveryCaseId: caseId,
      channel: "simulated_recovery_page",
      replacementSessionId: preview.sessionId,
      policyVersion: recoveryCase.policyVersion,
    },
  });

  return { sessionId: preview.sessionId };
}

/** Mark buyer re-engagement when resuming the ORIGINAL session. */
export async function markBuyerReengaged(caseId: string): Promise<void> {
  const recoveryCase = await db.recoveryCase.findUnique({ where: { id: caseId } });
  if (!recoveryCase || recoveryCase.status === "RECOVERED" || recoveryCase.status === "STOPPED") {
    return;
  }
  await db.recoveryCase.update({
    where: { id: caseId },
    data: { status: "BUYER_REENGAGED" },
  });
  await recordAuditEvent({
    sessionId: recoveryCase.checkoutSessionId,
    eventType: "RECOVERY_BUYER_REENGAGED",
    actor: "BUYER",
    payload: {
      recoveryCaseId: caseId,
      channel: "simulated_recovery_page",
      resumedOriginalSession: true,
      policyVersion: recoveryCase.policyVersion,
    },
  });
}

/**
 * Called when a buyer resumes a checkout session through the normal
 * pipeline; links the act of re-engagement to any active recovery case.
 */
export async function markBuyerReengagedForSession(sessionId: string): Promise<void> {
  const recoveryCase = await db.recoveryCase.findFirst({
    where: {
      OR: [{ checkoutSessionId: sessionId }, { replacementSessionId: sessionId }],
      status: { in: ["ELIGIBLE", "PROPOSED", "MERCHANT_APPROVED", "ACTION_EXECUTED"] },
    },
  });
  if (!recoveryCase) return;
  await db.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: { status: "BUYER_REENGAGED" },
  });
  await recordAuditEvent({
    sessionId: recoveryCase.checkoutSessionId,
    eventType: "RECOVERY_BUYER_REENGAGED",
    actor: "BUYER",
    payload: {
      recoveryCaseId: recoveryCase.id,
      channel: "checkout_resume",
      viaSessionId: sessionId,
      policyVersion: recoveryCase.policyVersion,
    },
  });
}

/**
 * Called after any verified fulfillment: if the fulfilled session belongs to
 * an active recovery case (original or replacement), close the loop.
 */
export async function markRecoveredIfLinked(sessionId: string, paidPaise: number): Promise<void> {
  const recoveryCase = await db.recoveryCase.findFirst({
    where: {
      OR: [{ checkoutSessionId: sessionId }, { replacementSessionId: sessionId }],
      status: { in: ["MERCHANT_APPROVED", "ACTION_EXECUTED", "BUYER_REENGAGED"] },
    },
  });
  if (!recoveryCase) return;

  await db.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: {
      status: "RECOVERED",
      actualRecoveredValuePaise: paidPaise,
    },
  });
  await recordAuditEvent({
    sessionId: recoveryCase.checkoutSessionId,
    eventType: "RECOVERY_SUCCEEDED",
    actor: "SYSTEM",
    payload: {
      recoveryCaseId: recoveryCase.id,
      recoveredValuePaise: paidPaise,
      formattedValue: formatPaise(paidPaise),
      viaSessionId: sessionId,
      policyVersion: recoveryCase.policyVersion,
    },
  });
}
