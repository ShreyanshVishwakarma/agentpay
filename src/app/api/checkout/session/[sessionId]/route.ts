import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getPolicyConfig } from "@/lib/checkout/policy-engine";
import { formatPaise } from "@/lib/money";

export const dynamic = "force-dynamic";

const sessionIdSchema = z.string().min(1).max(64);

/**
 * GET /api/checkout/session/[sessionId]
 * Re-validates a checkout session for resume. The policy engine re-runs
 * against live inventory and the current policy version — a stale or
 * out-of-policy cart can never be resumed.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await context.params;
    const parsed = sessionIdSchema.safeParse(sessionId);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_FAILED", message: "Invalid session id." } },
        { status: 400 },
      );
    }

    const session = await db.checkoutSession.findUnique({
      where: { id: parsed.data },
      include: { items: true },
    });
    if (!session) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Checkout session not found." } },
        { status: 404 },
      );
    }

    if (session.status !== "AWAITING_CONFIRMATION" && session.status !== "ORDER_CREATED") {
      return NextResponse.json(
        {
          error: {
            code: "SESSION_NOT_RESUMABLE",
            message: `This checkout is ${session.status.toLowerCase()} and can no longer be resumed.`,
          },
        },
        { status: 409 },
      );
    }

    // Session expiry per merchant policy.
    const policy = await getPolicyConfig();
    const ageMinutes = (Date.now() - session.createdAt.getTime()) / 60000;
    if (ageMinutes > policy.sessionExpiryMinutes) {
      await db.checkoutSession.update({
        where: { id: session.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json(
        {
          error: {
            code: "CHECKOUT_SESSION_EXPIRED",
            message: `This checkout expired after ${policy.sessionExpiryMinutes} minutes. Start a new request to continue.`,
          },
        },
        { status: 409 },
      );
    }

    // Record buyer re-engagement if this session belongs to a recovery case.
    const { markBuyerReengagedForSession } = await import("@/lib/recovery/recovery-service");
    await markBuyerReengagedForSession(session.id);

    return NextResponse.json({
      status: "RESUMABLE",
      sessionId: session.id,
      items: session.items.map((item) => ({
        sku: item.sku,
        itemName: item.itemName,
        unitPricePaise: item.unitPricePaise,
        formattedUnitPrice: formatPaise(item.unitPricePaise),
        quantity: item.quantity,
        lineTotalPaise: item.lineTotalPaise,
        formattedLineTotal: formatPaise(item.lineTotalPaise),
      })),
      totalPaise: session.totalPaise,
      formattedTotal: formatPaise(session.totalPaise),
      budgetPaise: session.buyerBudgetPaise,
      remainingBudgetPaise:
        session.buyerBudgetPaise !== null
          ? session.buyerBudgetPaise - session.totalPaise
          : null,
      policyExplanation: [
        "Cart re-validated against current merchant policy and live stock",
        "Explicit confirmation is required before any payment action",
      ],
      razorpayOrderCreated: false,
    });
  } catch (error) {
    console.error("[api/checkout/session]", error);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Could not load checkout session." } },
      { status: 500 },
    );
  }
}
