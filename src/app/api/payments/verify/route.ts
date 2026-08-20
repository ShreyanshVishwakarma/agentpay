import { NextResponse } from "next/server";
import { verifyPaymentRequestSchema } from "@/schemas/payment";
import { verifyPayment } from "@/lib/checkout/checkout-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/verify
 *
 * Receives the Razorpay checkout callback and verifies the HMAC signature
 * server-side before marking the session PAYMENT_VERIFIED and fulfilling.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = verifyPaymentRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          verified: false,
          status: "PAYMENT_FAILED",
          sessionId: "",
          reason: "PAYMENT_VERIFICATION_FAILED",
          message: "Malformed verification payload.",
        },
        { status: 400 },
      );
    }

    const outcome = await verifyPayment({
      checkoutSessionId: parsed.data.checkoutSessionId,
      razorpayPaymentId: parsed.data.razorpay_payment_id,
      razorpayOrderId: parsed.data.razorpay_order_id,
      signature: parsed.data.razorpay_signature,
    });

    return NextResponse.json({
      verified: outcome.verified,
      status: outcome.status,
      sessionId: outcome.sessionId,
      razorpayPaymentId: outcome.verified ? outcome.razorpayPaymentId : undefined,
      reason: outcome.verified ? undefined : outcome.code,
      message: outcome.verified ? undefined : outcome.message,
    });
  } catch (error) {
    console.error("[api/payments/verify]", error);
    return NextResponse.json(
      {
        verified: false,
        status: "PAYMENT_FAILED",
        sessionId: "",
        reason: "PAYMENT_VERIFICATION_FAILED",
        message: "Verification failed due to a server error. No fulfillment occurred.",
      },
      { status: 500 },
    );
  }
}
