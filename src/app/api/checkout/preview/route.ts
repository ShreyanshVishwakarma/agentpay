import { NextResponse } from "next/server";
import { previewRequestSchema } from "@/schemas/checkout";
import { createCheckoutPreview } from "@/lib/checkout/checkout-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/checkout/preview
 *
 * Validates the intent, runs the deterministic policy engine, and returns a
 * transparent preview or a machine-readable rejection. Never creates a
 * Razorpay order.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = previewRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          status: "REJECTED",
          reason: "INVALID_INTENT",
          message:
            "The purchase intent is malformed. Expected { intent: { items: [{ sku, quantity 1-5 }], maxBudgetPaise?, clarificationNeeded } }.",
          razorpayOrderCreated: false,
          suggestedAction: "Re-parse the buyer request and submit a valid intent.",
        },
        { status: 400 },
      );
    }

    const sourceMessage =
      typeof (body as Record<string, unknown>).sourceMessage === "string"
        ? ((body as Record<string, unknown>).sourceMessage as string).slice(0, 500)
        : undefined;

    const outcome = await createCheckoutPreview({
      intent: parsed.data.intent,
      sourceMessage,
    });

    if (outcome.kind === "rejected") {
      return NextResponse.json({
        status: "REJECTED",
        sessionId: outcome.sessionId,
        reason: outcome.rejection.code,
        message: outcome.rejection.message,
        razorpayOrderCreated: false,
        suggestedAction: outcome.rejection.suggestedAction,
      });
    }

    return NextResponse.json({
      status: "AWAITING_CONFIRMATION",
      sessionId: outcome.sessionId,
      cartHash: outcome.cartHash,
      items: outcome.items,
      totalPaise: outcome.totalPaise,
      formattedTotal: outcome.formattedTotal,
      budgetPaise: outcome.budgetPaise,
      remainingBudgetPaise: outcome.remainingBudgetPaise,
      policyExplanation: outcome.policyExplanation,
      reusedSession: outcome.reusedSession,
      razorpayOrderCreated: false,
    });
  } catch (error) {
    console.error("[api/checkout/preview]", error);
    return NextResponse.json(
      {
        status: "REJECTED",
        reason: "INVALID_INTENT",
        message: "Something went wrong while preparing your checkout. Please try again.",
        razorpayOrderCreated: false,
        suggestedAction: "Retry the request in a moment.",
      },
      { status: 500 },
    );
  }
}
