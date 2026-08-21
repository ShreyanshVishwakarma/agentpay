import { db } from "@/lib/db";
import { computeEventHash } from "@/lib/audit/hash-chain";
import { DEFAULT_POLICY_VALUES } from "@/lib/checkout/policy-engine";

/**
 * Synthetic demo data for the Commerce Control Plane.
 *
 * EVERYTHING created here is explicitly synthetic: buyer messages are
 * prefixed "[demo]", ids use the *_demo_seed_* namespace, and no real
 * payment, gateway call, or message delivery is involved.
 */

// Deterministic PRNG so seeded demos look identical on every reset.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260821);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!;
}

function daysAgo(days: number, hourJitter = true): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  if (hourJitter) date.setHours(Math.floor(rand() * 14) + 8, Math.floor(rand() * 60), 0, 0);
  return date;
}

const CATALOG = [
  { sku: "sql-pro-pack", name: "SQL Pro Interview Pack", pricePaise: 39900, stock: 10 },
  { sku: "nextjs-backend-pack", name: "Next.js Backend Pack", pricePaise: 49900, stock: 8 },
  { sku: "database-design-pack", name: "Database Design Pack", pricePaise: 29900, stock: 15 },
  { sku: "system-design-starter", name: "System Design Starter Kit", pricePaise: 59900, stock: 3 },
  { sku: "sold-out-bundle", name: "Premium Interview Bundle", pricePaise: 99900, stock: 0 },
] as const;

const DEMO_REQUESTS = [
  "[demo] Buy two SQL Pro Interview Packs under ₹800",
  "[demo] Get the Next.js Backend Pack",
  "[demo] I need the Database Design Pack for interviews",
  "[demo] Buy one System Design Starter Kit",
  "[demo] Two database packs please",
];

async function appendEvent(
  sessionId: string | null,
  eventType: string,
  actor: string,
  payload: Record<string, unknown>,
  createdAt: Date,
): Promise<void> {
  const last = await db.auditEvent.findFirst({
    where: { sessionId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { eventHash: true },
  });
  const previousHash = last?.eventHash ?? null;
  const eventHash = computeEventHash(previousHash, { sessionId, eventType, actor, payload });
  await db.auditEvent.create({
    data: {
      sessionId,
      eventType,
      actor,
      payload: payload as never,
      previousHash,
      eventHash,
      createdAt,
    },
  });
}

interface SessionSpec {
  status:
    | "PAYMENT_VERIFIED"
    | "PAYMENT_FAILED"
    | "REJECTED_BUDGET"
    | "REJECTED_STOCK"
    | "REJECTED_QUANTITY"
    | "ORDER_CREATED_ABANDONED"
    | "AWAITING_CONFIRMATION_ABANDONED"
    | "EXPIRED";
  sku: string;
  quantity: number;
  daysBack: number;
  budgetPaise?: number;
}

async function createSyntheticSession(spec: SessionSpec, index: number): Promise<string> {
  const catalogItem = CATALOG.find((item) => item.sku === spec.sku)!;
  const catalogRow = await db.catalogItem.findUnique({ where: { sku: spec.sku } });
  if (!catalogRow) {
    throw new Error(`Catalog item missing during seeding: ${spec.sku}`);
  }
  const totalPaise = catalogItem.pricePaise * spec.quantity;
  const createdAt = daysAgo(spec.daysBack);
  const updatedAt = new Date(createdAt);
  const requestId = `demo_seed_${String(index).padStart(3, "0")}`;
  const sourceMessage =
    pick(DEMO_REQUESTS) + ` [${catalogItem.name} ×${spec.quantity}]`;

  let attemptedTotalPaise = totalPaise;
  let rejectionReason: string | null = null;
  if (spec.status === "REJECTED_BUDGET") rejectionReason = "BUDGET_EXCEEDED";
  if (spec.status === "REJECTED_STOCK") rejectionReason = "OUT_OF_STOCK";
  if (spec.status === "REJECTED_QUANTITY") {
    rejectionReason = "ITEM_LIMIT_EXCEEDED";
    attemptedTotalPaise = totalPaise;
  }

  const session = await db.checkoutSession.create({
    data: {
      cartHash: `synthetic_${requestId}_${spec.sku}_${spec.quantity}`,
      status:
        spec.status === "REJECTED_BUDGET" ||
        spec.status === "REJECTED_STOCK" ||
        spec.status === "REJECTED_QUANTITY"
          ? "REJECTED"
          : spec.status === "AWAITING_CONFIRMATION_ABANDONED"
            ? "AWAITING_CONFIRMATION"
            : spec.status === "EXPIRED"
              ? "EXPIRED"
              : spec.status === "ORDER_CREATED_ABANDONED"
                ? "ORDER_CREATED"
                : spec.status,
      totalPaise: rejectionReason ? 0 : totalPaise,
      currency: "INR",
      buyerBudgetPaise: spec.budgetPaise ?? null,
      razorpayOrderId:
        spec.status === "PAYMENT_VERIFIED" ||
        spec.status === "PAYMENT_FAILED" ||
        spec.status === "ORDER_CREATED_ABANDONED"
          ? `order_${requestId}`
          : null,
      razorpayPaymentId:
        spec.status === "PAYMENT_VERIFIED" ? `pay_${requestId}` : null,
      razorpaySignature:
        spec.status === "PAYMENT_VERIFIED"
          ? `sig_${requestId}_${Math.floor(rand() * 1e9).toString(16)}`
          : null,
      rejectionReason,
      ...(rejectionReason !== null
        ? {
            rejectionDetails: {
              message: `Synthetic rejection (${rejectionReason})`,
              suggestedAction: "Demo data",
              attemptedTotalPaise,
            } as never,
          }
        : {}),
      idempotencyKey: `idem_${requestId}`,
      createdAt,
      updatedAt,
    },
  });

  await db.checkoutItem.create({
    data: {
      sessionId: session.id,
      catalogItemId: catalogRow.id,
      sku: spec.sku,
      itemName: catalogItem.name,
      unitPricePaise: catalogItem.pricePaise,
      quantity: spec.quantity,
      lineTotalPaise: totalPaise,
    },
  });

  // ---- Audit chain -------------------------------------------------------
  let tick = new Date(createdAt);
  const nextTime = () => {
    tick = new Date(tick.getTime() + (30 + Math.floor(rand() * 90)) * 1000);
    return tick;
  };

  await appendEvent(session.id, "INTENT_RECEIVED", "BUYER", {
    synthetic: true,
    sourceMessage,
    itemCount: 1,
  }, nextTime());
  await appendEvent(session.id, "POLICY_CHECK_STARTED", "POLICY_ENGINE", {
    synthetic: true,
    rules: ["sku_exists", "item_active", "stock", "limits", "budget"],
  }, nextTime());

  if (rejectionReason) {
    await appendEvent(session.id, "POLICY_REJECTED", "POLICY_ENGINE", {
      synthetic: true,
      code: rejectionReason,
      attemptedTotalPaise,
      message: `Synthetic ${rejectionReason} rejection — no payment action was taken.`,
    }, nextTime());
    return session.id;
  }

  await appendEvent(session.id, "POLICY_APPROVED", "POLICY_ENGINE", {
    synthetic: true,
    totalPaise,
  }, nextTime());
  await appendEvent(session.id, "CHECKOUT_PREVIEW_CREATED", "SYSTEM", {
    synthetic: true,
    totalPaise,
    awaitingConfirmation: true,
  }, nextTime());

  if (spec.status === "AWAITING_CONFIRMATION_ABANDONED") return session.id;

  if (spec.status === "EXPIRED") {
    await appendEvent(session.id, "PAYMENT_MARKED_FAILED", "SYSTEM", {
      synthetic: true,
      reason: "session_expired_before_confirmation",
    }, nextTime());
    return session.id;
  }

  await appendEvent(session.id, "BUYER_CONFIRMED", "BUYER", {
    synthetic: true,
    totalPaise,
  }, nextTime());
  await appendEvent(session.id, "RAZORPAY_ORDER_CREATE_STARTED", "SYSTEM", {
    synthetic: true,
    amountPaise: totalPaise,
  }, nextTime());
  await appendEvent(session.id, "RAZORPAY_ORDER_CREATED", "RAZORPAY", {
    synthetic: true,
    razorpayOrderId: `order_${requestId}`,
    amountPaise: totalPaise,
  }, nextTime());

  if (spec.status === "ORDER_CREATED_ABANDONED") {
    await appendEvent(session.id, "CHECKOUT_OPENED", "SYSTEM", {
      synthetic: true,
      handedToClient: true,
    }, nextTime());
    return session.id;
  }

  await appendEvent(session.id, "CHECKOUT_OPENED", "SYSTEM", {
    synthetic: true,
    handedToClient: true,
  }, nextTime());
  await appendEvent(session.id, "PAYMENT_CALLBACK_RECEIVED", "RAZORPAY", {
    synthetic: true,
    razorpayOrderId: `order_${requestId}`,
    razorpayPaymentId: `pay_${requestId}`,
  }, nextTime());

  if (spec.status === "PAYMENT_VERIFIED") {
    await appendEvent(session.id, "PAYMENT_SIGNATURE_VERIFIED", "SYSTEM", {
      synthetic: true,
      razorpayPaymentId: `pay_${requestId}`,
      fulfilledUnits: spec.quantity,
    }, nextTime());
  } else {
    await appendEvent(session.id, "PAYMENT_SIGNATURE_REJECTED", "SYSTEM", {
      synthetic: true,
      reason: "Synthetic signature mismatch",
    }, nextTime());
    await appendEvent(session.id, "PAYMENT_MARKED_FAILED", "SYSTEM", {
      synthetic: true,
      fulfillmentOccurred: false,
    }, nextTime());
  }

  return session.id;
}

/** Seed policy baseline (v1 + one demonstrated change to v2) and catalog. */
export async function seedBaseData(): Promise<void> {
  await db.policyConfig.upsert({
    where: { id: "policy-default" },
    update: {},
    create: {
      id: "policy-default",
      merchantName: "SkillForge Learning",
      maxOrderPaise: 100000,
      maxItemsPerOrder: 5,
      confirmationRequired: true,
    },
  });

  for (const item of CATALOG) {
    await db.catalogItem.upsert({
      where: { sku: item.sku },
      update: {
        name: item.name,
        pricePaise: item.pricePaise,
        stock: item.stock,
        active: true,
        paused: false,
        agentDiscoverable: true,
        agentPurchasable: true,
        ...(item.sku === "system-design-starter" ? { maxAgentQuantity: 2 } : {}),
      },
      create: {
        sku: item.sku,
        name: item.name,
        description: `Synthetic demo product — ${item.name}.`,
        pricePaise: item.pricePaise,
        stock: item.stock,
        active: true,
        ...(item.sku === "system-design-starter" ? { maxAgentQuantity: 2 } : {}),
      },
    });
  }

  const existingVersions = await db.merchantPolicy.count();
  if (existingVersions > 0) return;

  // v1 — baseline.
  await db.merchantPolicy.create({
    data: {
      policyVersion: 1,
      merchantName: "SkillForge Learning",
      maxOrderPaise: 100000,
      maxItemsPerOrder: 5,
      confirmationRequired: true,
      ...DEFAULT_POLICY_VALUES,
      changedBy: "Merchant Demo Admin",
      changeNote: "Initial AI-commerce policy",
    },
  });

  // v2 — demonstrated policy change (extra-confirmation threshold lowered).
  await db.merchantPolicy.create({
    data: {
      policyVersion: 2,
      merchantName: "SkillForge Learning",
      maxOrderPaise: 100000,
      maxItemsPerOrder: 5,
      confirmationRequired: true,
      ...DEFAULT_POLICY_VALUES,
      extraConfirmationThresholdPaise: 60000,
      changedBy: "Merchant Demo Admin",
      changeNote: "Lowered extra-confirmation threshold to ₹600 after review",
    },
  });
  await db.merchantPolicy.updateMany({
    where: { policyVersion: 1 },
    data: { supersededAt: new Date() },
  });

  await appendEvent(null, "POLICY_CHANGED", "MERCHANT", {
    synthetic: true,
    policyVersion: 2,
    previousPolicyVersion: 1,
    changedBy: "Merchant Demo Admin",
    changeNote: "Lowered extra-confirmation threshold to ₹600 after review",
    oldValues: { extraConfirmationThresholdPaise: DEFAULT_POLICY_VALUES.extraConfirmationThresholdPaise },
    newValues: { extraConfirmationThresholdPaise: 60000 },
  }, daysAgo(13));
}

/** Wipe + rebuild all synthetic checkout history, recovery cases, webhooks. */
export async function seedSyntheticHistory(): Promise<void> {
  await db.recoveryAction.deleteMany();
  await db.recoveryCase.deleteMany();
  await db.auditEvent.deleteMany();
  await db.checkoutItem.deleteMany();
  await db.checkoutSession.deleteMany();
  await db.webhookEvent.deleteMany();

  const specs: SessionSpec[] = [];
  // 18 verified payments spread over two weeks.
  for (let i = 0; i < 18; i++) {
    specs.push({
      status: "PAYMENT_VERIFIED",
      sku: pick(["sql-pro-pack", "nextjs-backend-pack", "database-design-pack"]),
      quantity: 1 + Math.floor(rand() * 2),
      daysBack: Math.floor(rand() * 14),
      budgetPaise: rand() > 0.5 ? 80000 : undefined,
    });
  }
  // 6 failed payments (recovery candidates).
  for (let i = 0; i < 6; i++) {
    specs.push({
      status: "PAYMENT_FAILED",
      sku: i < 4 ? "sql-pro-pack" : "nextjs-backend-pack",
      quantity: 1,
      daysBack: Math.max(0, Math.min(6, 5 - i)),
    });
  }
  // Rejections.
  specs.push({ status: "REJECTED_BUDGET", sku: "sql-pro-pack", quantity: 3, daysBack: 4, budgetPaise: 80000 });
  specs.push({ status: "REJECTED_BUDGET", sku: "nextjs-backend-pack", quantity: 2, daysBack: 2, budgetPaise: 50000 });
  specs.push({ status: "REJECTED_STOCK", sku: "sold-out-bundle", quantity: 1, daysBack: 3 });
  specs.push({ status: "REJECTED_STOCK", sku: "sold-out-bundle", quantity: 1, daysBack: 1 });
  specs.push({ status: "REJECTED_QUANTITY", sku: "sql-pro-pack", quantity: 3, daysBack: 5 });
  specs.push({ status: "REJECTED_QUANTITY", sku: "database-design-pack", quantity: 3, daysBack: 6 });
  // Abandoned after confirmation (recovery candidates).
  for (let i = 0; i < 5; i++) {
    specs.push({
      status: "ORDER_CREATED_ABANDONED",
      sku: i % 2 === 0 ? "sql-pro-pack" : "database-design-pack",
      quantity: 1,
      daysBack: 1 + i,
    });
  }
  // Abandoned previews + expired.
  for (let i = 0; i < 4; i++) {
    specs.push({
      status: "AWAITING_CONFIRMATION_ABANDONED",
      sku: "sql-pro-pack",
      quantity: 1,
      daysBack: 2 + i,
    });
  }
  specs.push({ status: "EXPIRED", sku: "nextjs-backend-pack", quantity: 1, daysBack: 7 });
  specs.push({ status: "EXPIRED", sku: "sql-pro-pack", quantity: 2, daysBack: 9 });

  const sessionIds: string[] = [];
  for (let index = 0; index < specs.length; index++) {
    sessionIds.push(await createSyntheticSession(specs[index]!, index));
  }

  await seedRecoveryCases(sessionIds);
  await seedWebhookEvidence(sessionIds[0]!);
}

async function seedRecoveryCases(sessionIds: string[]): Promise<void> {
  void sessionIds;
  const failedSessions = await db.checkoutSession.findMany({
    where: { status: "PAYMENT_FAILED" },
    orderBy: { createdAt: "asc" },
  });

  const orderAbandoned = await db.checkoutSession.findMany({
    where: { status: "ORDER_CREATED" },
    orderBy: { createdAt: "asc" },
  });
  const awaitingAbandoned = await db.checkoutSession.findMany({
    where: { status: "AWAITING_CONFIRMATION" },
    orderBy: { createdAt: "asc" },
  });

  const policyVersion = 2;
  const now = new Date();

  interface CasePlan {
    sessionId: string;
    interventionType: string;
    status: string;
    attemptCount: number;
    expectedPaise: number;
    stoppedReason?: string;
    withAction?: boolean;
  }

  const plans: CasePlan[] = [
    // Three clearly recoverable cases.
    { sessionId: failedSessions[0]?.id ?? "", interventionType: "SEND_PAYMENT_REMINDER", status: "ELIGIBLE", attemptCount: 0, expectedPaise: failedSessions[0]?.totalPaise ?? 39900 },
    { sessionId: failedSessions[1]?.id ?? "", interventionType: "SEND_PAYMENT_REMINDER", status: "ELIGIBLE", attemptCount: 0, expectedPaise: failedSessions[1]?.totalPaise ?? 39900 },
    { sessionId: orderAbandoned[0]?.id ?? "", interventionType: "RESUME_CHECKOUT", status: "ELIGIBLE", attemptCount: 0, expectedPaise: orderAbandoned[0]?.totalPaise ?? 39900 },
    // Proposed, awaiting merchant approval.
    { sessionId: failedSessions[2]?.id ?? "", interventionType: "SEND_PAYMENT_REMINDER", status: "PROPOSED", attemptCount: 0, expectedPaise: failedSessions[2]?.totalPaise ?? 39900 },
    // Executed once — cooling off before the next attempt.
    { sessionId: orderAbandoned[1]?.id ?? "", interventionType: "RESUME_CHECKOUT", status: "ACTION_EXECUTED", attemptCount: 1, expectedPaise: orderAbandoned[1]?.totalPaise ?? 39900, withAction: true },
    { sessionId: failedSessions[3]?.id ?? "", interventionType: "SEND_PAYMENT_REMINDER", status: "ACTION_EXECUTED", attemptCount: 1, expectedPaise: failedSessions[3]?.totalPaise ?? 39900, withAction: true },
    // Recovered end-to-end.
    { sessionId: failedSessions[4]?.id ?? "", interventionType: "SEND_PAYMENT_REMINDER", status: "RECOVERED", attemptCount: 1, expectedPaise: failedSessions[4]?.totalPaise ?? 39900, withAction: true },
    // Stopped by buyer decline.
    { sessionId: failedSessions[5]?.id ?? "", interventionType: "SEND_PAYMENT_REMINDER", status: "STOPPED", attemptCount: 1, expectedPaise: failedSessions[5]?.totalPaise ?? 39900, stoppedReason: "buyer_declined", withAction: true },
    // Expired window.
    { sessionId: awaitingAbandoned[awaitingAbandoned.length - 1]?.id ?? "", interventionType: "RESUME_CHECKOUT", status: "EXPIRED", attemptCount: 0, expectedPaise: 39900 },
  ];

  for (const plan of plans) {
    if (!plan.sessionId) continue;
    const created = await db.recoveryCase.create({
      data: {
        checkoutSessionId: plan.sessionId,
        status: plan.status,
        interventionType: plan.interventionType,
        reasonCodes: {
          codes: ["SYNTHETIC_DEMO"],
          rule: "seeded_scenario",
          merchantBound: "max 2 attempts, merchant approval required",
          opportunityType: "Payment failure",
          synthetic: true,
        } as never,
        expectedRecoveryValuePaise: plan.expectedPaise,
        actualRecoveredValuePaise:
          plan.status === "RECOVERED" ? plan.expectedPaise : null,
        attemptCount: plan.attemptCount,
        nextEligibleAt:
          plan.status === "ACTION_EXECUTED"
            ? new Date(now.getTime() + 10 * 60000)
            : null,
        stoppedReason: plan.stoppedReason ?? null,
        policyVersion,
      },
    });

    if (plan.withAction) {
      await db.recoveryAction.create({
        data: {
          recoveryCaseId: created.id,
          actionType: plan.interventionType,
          messagePreview:
            "Your checkout was not completed. The item is still available — you can safely resume checkout when ready.",
          copyMode: "template",
          copyVersion: "recovery-copy-v1",
          approvedBy: "Merchant Demo Admin",
          executedAt: daysAgo(0),
          result: plan.status === "RECOVERED" ? "buyer_completed_payment" : "simulated_delivery",
          metadata: { synthetic: true, simulated: true, policyVersion } as never,
        },
      });
    }

    if (plan.status === "RECOVERED") {
      await appendEvent(plan.sessionId, "RECOVERY_SUCCEEDED", "SYSTEM", {
        synthetic: true,
        recoveryCaseId: created.id,
        recoveredValuePaise: plan.expectedPaise,
        policyVersion,
      }, daysAgo(0));
    }
    if (plan.status === "STOPPED") {
      await appendEvent(plan.sessionId, "RECOVERY_STOPPED", "BUYER", {
        synthetic: true,
        recoveryCaseId: created.id,
        reason: "buyer_declined",
        policyVersion,
      }, daysAgo(0));
    }
  }
}

async function seedWebhookEvidence(sessionId: string): Promise<void> {
  const session = await db.checkoutSession.findUnique({ where: { id: sessionId } });
  if (!session?.razorpayOrderId || !session.razorpayPaymentId) return;

  const eventId = `evt_demo_seed_duplicate_check`;
  const existing = await db.webhookEvent.findUnique({ where: { eventId } });
  if (existing) return;

  await db.webhookEvent.create({
    data: {
      eventId,
      eventType: "payment.captured",
      payload: {
        synthetic: true,
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: session.razorpayPaymentId,
              order_id: session.razorpayOrderId,
              amount: session.totalPaise,
              status: "captured",
            },
          },
        },
      } as never,
      status: "PROCESSED",
      processedAt: session.updatedAt,
    },
  });

  // Evidence that a redelivery was ignored by the idempotent inbox.
  // Appended "now" so it stays the latest link in the session chain.
  await appendEvent(session.id, "WEBHOOK_EVENT_DUPLICATE", "SYSTEM", {
    synthetic: true,
    eventId,
    note: "Redelivered webhook ignored; inventory untouched.",
  }, new Date());
}

/** Full demo reset: base configuration + synthetic history. */
export async function resetDemoData(): Promise<{ sessions: number }> {
  await seedBaseData();
  await seedSyntheticHistory();
  const count = await db.checkoutSession.count();
  return { sessions: count };
}
