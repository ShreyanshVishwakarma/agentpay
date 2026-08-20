import { NextResponse } from "next/server";
import { processRazorpayWebhook } from "@/lib/razorpay/webhook-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/razorpay
 *
 * Server-to-server payment events. The RAW request body is required for
 * HMAC verification, so it is read as text before any parsing. Valid
 * deliveries are stored in an idempotent inbox keyed by the event id;
 * redeliveries return 200 without re-processing.
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");
    const eventId = request.headers.get("x-razorpay-event-id");

    const result = await processRazorpayWebhook({ rawBody, signature, eventId });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error("[api/webhooks/razorpay]", error);
    // 500 makes Razorpay retry — the inbox dedup keeps retries safe.
    return NextResponse.json(
      { received: false, reason: "internal error" },
      { status: 500 },
    );
  }
}
