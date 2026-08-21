import { db } from "@/lib/db";
import { decideIntervention } from "@/lib/recovery/intervention-engine";

/**
 * Agentic revenue analytics. All money math is integer paise aggregated by
 * the database; no floating point anywhere.
 *
 * Definitions:
 * - Revenue verified:   sum of totals of PAYMENT_VERIFIED sessions.
 * - Revenue protected:  sum of attempted cart values prevented by policy
 *                       rejections (budget, stock, quantity, access caps).
 *                       Successful payments are NEVER counted here.
 * - Revenue at risk:    sum of totals of PAYMENT_VERIFIED-excluded,
 *                       recovery-eligible sessions (failed / expired /
 *                       abandoned after confirmation).
 * - Recovery conversion: recovered cases ÷ recovery-eligible cases.
 */

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  valuePaise: number;
  conversionFromPrevious: number | null;
  dropOffFromPrevious: number | null;
}

export interface InsightsSnapshot {
  proposals: number;
  confirmedCheckouts: number;
  verifiedPayments: number;
  rejectedUnsafeRequests: number;
  revenueVerifiedPaise: number;
  revenueProtectedPaise: number;
  revenueAtRiskPaise: number;
  recoveryEligibleCount: number;
  recoveryRecoveredCount: number;
  recoveryConversionRate: number;
  funnel: FunnelStage[];
  topBlockedReasons: Array<{ reason: string; count: number; valuePaise: number }>;
}

export async function computeInsights(): Promise<InsightsSnapshot> {
  const [statusGroups, intentCount, previewedCount, confirmedCount, orderCreatedAgg, recoveryCounts] =
    await Promise.all([
      db.checkoutSession.groupBy({
        by: ["status"],
        _count: { _all: true },
        _sum: { totalPaise: true },
      }),
      db.auditEvent.count({ where: { eventType: "INTENT_RECEIVED" } }),
      db.auditEvent.count({ where: { eventType: "CHECKOUT_PREVIEW_CREATED" } }),
      db.auditEvent.count({ where: { eventType: "BUYER_CONFIRMED" } }),
      db.checkoutSession.aggregate({
        where: { razorpayOrderId: { not: null } },
        _count: { _all: true },
        _sum: { totalPaise: true },
      }),
      db.recoveryCase.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

  const byStatus = new Map(statusGroups.map((group) => [group.status, group]));
  const countOf = (status: string) => byStatus.get(status)?._count._all ?? 0;
  const sumOf = (status: string) => byStatus.get(status)?._sum.totalPaise ?? 0;

  const orderCreated = orderCreatedAgg._count._all;
  const orderCreatedValue = orderCreatedAgg;

  // Revenue protected: attempted values from rejected sessions. Rejections
  // store their would-be total in rejectionDetails.attemptedTotalPaise.
  const rejectedSessions = await db.checkoutSession.findMany({
    where: { status: "REJECTED" },
    select: { rejectionReason: true, rejectionDetails: true },
  });
  let revenueProtectedPaise = 0;
  const blockedByReason = new Map<string, { count: number; valuePaise: number }>();
  for (const session of rejectedSessions) {
    const details = session.rejectionDetails as { attemptedTotalPaise?: number } | null;
    const attempted = details?.attemptedTotalPaise ?? 0;
    revenueProtectedPaise += attempted;
    if (session.rejectionReason) {
      const entry = blockedByReason.get(session.rejectionReason) ?? {
        count: 0,
        valuePaise: 0,
      };
      entry.count += 1;
      entry.valuePaise += attempted;
      blockedByReason.set(session.rejectionReason, entry);
    }
  }

  // Revenue at risk: failed + expired + abandoned-after-confirmation that
  // are eligible for recovery.
  const atRiskStatuses = ["PAYMENT_FAILED", "EXPIRED", "ORDER_CREATED"];
  const atRiskAgg = await db.checkoutSession.aggregate({
    where: { status: { in: atRiskStatuses } },
    _sum: { totalPaise: true },
    _count: { _all: true },
  });

  const recoveryEligible = recoveryCounts
    .filter((group) => group.status !== "NOT_ELIGIBLE")
    .reduce((sum, group) => sum + group._count._all, 0);
  const recoveryRecovered =
    recoveryCounts.find((group) => group.status === "RECOVERED")?._count._all ?? 0;

  const funnel: FunnelStage[] = buildFunnel([
    { key: "intent", label: "Intent received", count: intentCount, valuePaise: null },
    {
      key: "previewed",
      label: "Cart previewed",
      count: previewedCount,
      valuePaise:
        (byStatus.get("AWAITING_CONFIRMATION")?._sum.totalPaise ?? 0) +
        (orderCreatedValue._sum.totalPaise ?? 0),
    },
    { key: "confirmed", label: "Buyer confirmed", count: confirmedCount, valuePaise: null },
    {
      key: "order",
      label: "Razorpay Order created",
      count: orderCreated,
      valuePaise: orderCreatedValue._sum.totalPaise ?? 0,
    },
    {
      key: "verified",
      label: "Payment verified",
      count: countOf("PAYMENT_VERIFIED"),
      valuePaise: sumOf("PAYMENT_VERIFIED"),
    },
  ]);

  const topBlockedReasons = [...blockedByReason.entries()]
    .map(([reason, entry]) => ({
      reason,
      count: entry.count,
      valuePaise: entry.valuePaise,
    }))
    .sort((a, b) => b.count - a.count || b.valuePaise - a.valuePaise)
    .slice(0, 5);

  return {
    proposals: previewedCount,
    confirmedCheckouts: confirmedCount,
    verifiedPayments: countOf("PAYMENT_VERIFIED"),
    rejectedUnsafeRequests: rejectedSessions.length,
    revenueVerifiedPaise: sumOf("PAYMENT_VERIFIED"),
    revenueProtectedPaise,
    revenueAtRiskPaise: atRiskAgg._sum.totalPaise ?? 0,
    recoveryEligibleCount: recoveryEligible,
    recoveryRecoveredCount: recoveryRecovered,
    recoveryConversionRate:
      recoveryEligible > 0 ? recoveryRecovered / recoveryEligible : 0,
    funnel,
    topBlockedReasons,
  };
}

function buildFunnel(
  stages: Array<{ key: string; label: string; count: number; valuePaise: number | null }>,
): FunnelStage[] {
  return stages.map((stage, index) => {
    const previous = index > 0 ? stages[index - 1] : null;
    return {
      key: stage.key,
      label: stage.label,
      count: stage.count,
      valuePaise: stage.valuePaise ?? 0,
      conversionFromPrevious:
        previous && previous.count > 0 ? stage.count / previous.count : null,
      dropOffFromPrevious: previous ? Math.max(0, previous.count - stage.count) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Revenue opportunities table
// ---------------------------------------------------------------------------

export interface OpportunityRow {
  sessionId: string;
  buyerRequestSummary: string;
  cartValuePaise: number;
  state: string;
  opportunityType: string;
  interventionType: string;
  recommendedIntervention: string;
  expectedRecoveryValuePaise: number;
  confidence: number;
  allowedAction: string;
  hasCase: boolean;
}

const ALLOWED_ACTIONS: Record<string, string> = {
  RESUME_CHECKOUT: "Merchant-approved resume invite",
  SEND_PAYMENT_REMINDER: "Merchant-approved payment reminder",
  OFFER_LOWER_PRICED_ALTERNATIVE: "Merchant-approved alternative offer",
  OFFER_RESTOCK_NOTIFICATION: "Restock notification only",
  REQUEST_BUDGET_INCREASE: "Invite buyer to approve higher budget",
  DO_NOT_CONTACT: "None — stopping rule active",
};

/** Deterministic heuristic: recent, untouched intent scores higher. */
function confidenceScore(attemptCount: number, ageDays: number): number {
  const raw = 0.95 - attemptCount * 0.2 - ageDays * 0.04;
  return Math.min(0.95, Math.max(0.3, Number(raw.toFixed(2))));
}

export async function getOpportunityRows(): Promise<OpportunityRow[]> {
  const policy = await getPolicyValuesForInsights();
  const sessions = await db.checkoutSession.findMany({
    where: { status: { in: ["PAYMENT_FAILED", "ORDER_CREATED", "EXPIRED", "REJECTED"] } },
    include: { items: true, recoveryCase: true },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });

  const rows: OpportunityRow[] = [];
  const now = Date.now();

  for (const session of sessions) {
    const details = session.rejectionDetails as
      | { attemptedTotalPaise?: number }
      | null;
    const cartValuePaise =
      session.totalPaise > 0 ? session.totalPaise : (details?.attemptedTotalPaise ?? 0);
    if (cartValuePaise <= 0 && session.rejectionReason !== "OUT_OF_STOCK") continue;

    const primaryItem = session.items[0];
    const skus = session.items.map((item) => item.sku);
    const catalogItems =
      skus.length > 0
        ? await db.catalogItem.findMany({ where: { sku: { in: skus } } })
        : [];
    const inStock =
      catalogItems.length > 0 &&
      catalogItems.every((item) => !item.paused && item.active && item.stock > 0);

    let alternative: { sku: string; name: string; pricePaise: number } | null = null;
    if (!inStock && primaryItem) {
      const candidates = await db.catalogItem.findMany({
        where: {
          active: true,
          paused: false,
          agentPurchasable: true,
          stock: { gt: 0 },
          sku: { notIn: skus.length > 0 ? skus : ["__none__"] },
          pricePaise: { lte: primaryItem.unitPricePaise },
        },
        orderBy: { pricePaise: "desc" },
        take: 1,
      });
      if (candidates[0]) {
        alternative = {
          sku: candidates[0].sku,
          name: candidates[0].name,
          pricePaise: candidates[0].pricePaise,
        };
      }
    }

    const decision = decideIntervention({
      sessionStatus: session.status,
      failureReason: session.rejectionReason,
      cartValuePaise,
      productName: primaryItem?.itemName ?? "your selected item",
      inStock,
      alternative,
      attemptCount: session.recoveryCase?.attemptCount ?? 0,
      policy: {
        recoveryEnabled: policy.recoveryEnabled,
        maxRecoveryAttempts: policy.maxRecoveryAttempts,
        coolingOffMinutesAfterFailures: policy.coolingOffMinutesAfterFailures,
      },
      sessionAgeMinutes: Math.floor(
        (now - session.createdAt.getTime()) / 60000,
      ),
      budgetPaise: session.buyerBudgetPaise,
    });

    if (decision.opportunityType === "Not applicable") continue;

    const intentEvent = await db.auditEvent.findFirst({
      where: { sessionId: session.id, eventType: "INTENT_RECEIVED" },
      orderBy: { createdAt: "asc" },
      select: { payload: true },
    });
    const summary =
      (intentEvent?.payload as { sourceMessage?: string } | null)?.sourceMessage ??
      "Checkout prepared via AgentPay agent";

    rows.push({
      sessionId: session.id,
      buyerRequestSummary: summary,
      cartValuePaise,
      state: session.status,
      opportunityType: decision.opportunityType,
      interventionType: decision.interventionType,
      recommendedIntervention: decision.humanExplanation,
      expectedRecoveryValuePaise: decision.expectedRecoveryValuePaise,
      confidence: confidenceScore(
        session.recoveryCase?.attemptCount ?? 0,
        Math.floor((now - session.createdAt.getTime()) / 86400000),
      ),
      allowedAction: ALLOWED_ACTIONS[decision.interventionType] ?? "Review manually",
      hasCase: session.recoveryCase !== null,
    });
  }

  return rows.slice(0, 12);
}

async function getPolicyValuesForInsights() {
  const { getPolicyConfig } = await import("@/lib/checkout/policy-engine");
  return getPolicyConfig();
}
