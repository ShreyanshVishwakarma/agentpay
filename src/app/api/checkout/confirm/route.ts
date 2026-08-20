import { NextResponse } from "next/server";
import { confirmRequestSchema } from "@/schemas/checkout";
import { confirmCheckout } from "@/lib/checkout/checkout-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/checkout/confirm
 *
 * The explicit buyer confirmation gate. Re-checks all policies against live
 * inventory, reuses duplicate active sessions, and only then creates a
 * Razorpay test-mode Order.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = confirmRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_INTENT",
            message: "Send a JSON body like { \"sessionId\": \"...\" }.",
          },
        },
        { status: 400 },
      );
    }

    const outcome = await confirmCheckout(parsed.data.sessionId);

    if (outcome.kind === "order_created") {
      return NextResponse.json({
        status: "ORDER_CREATED",
        sessionId: outcome.sessionId,
        reused: outcome.reused,
        razorpayOrderCreated: true,
        razorpay: {
          keyId: outcome.razorpay.keyId,
          orderId: outcome.razorpay.orderId,
          amountPaise: outcome.razorpay.amountPaise,
          currency: outcome.razorpay.currency,
          merchantName: outcome.razorpay.merchantName,
          testMode: outcome.razorpay.testMode,
        },
      });
    }

    if (outcome.kind === "rejected") {
      return NextResponse.json({
        status: "REJECTED",
        sessionId: outcome.sessionId,
        reason: outcome.code,
        message: outcome.message,
        razorpayOrderCreated: false,
        suggestedAction: outcome.suggestedAction,
      });
    }

    return NextResponse.json(
      { error: { code: outcome.code, message: outcome.message } },
      { status: 409 },
    );
  } catch (error) {
    console.error("[api/checkout/confirm]", error);
    return NextResponse.json(
      {
        error: {
          code: "RAZORPAY_ORDER_CREATION_FAILED",
          message: "Could not create the payment order. No charge has been made.",
        },
      },
      { status: 500 },
    );
  }
}
