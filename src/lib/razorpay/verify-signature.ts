import { createHmac, timingSafeEqual } from "node:crypto";
import { env, razorpayConfigured } from "@/lib/env";

export interface SignatureCheckResult {
  valid: boolean;
  reason?: string;
}

/**
 * Server-side Razorpay payment signature verification.
 *
 *   expected = HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, RAZORPAY_KEY_SECRET)
 *
 * Comparison is timing-safe. This is the ONLY place a payment may be
 * considered authentic; checkout popup success means nothing by itself.
 */
export function verifyRazorpaySignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): SignatureCheckResult {
  if (!razorpayConfigured) {
    return { valid: false, reason: "Razorpay credentials are not configured" };
  }

  const { razorpayOrderId, razorpayPaymentId, signature } = params;

  if (
    typeof razorpayOrderId !== "string" ||
    typeof razorpayPaymentId !== "string" ||
    typeof signature !== "string" ||
    razorpayOrderId.length === 0 ||
    razorpayPaymentId.length === 0 ||
    signature.length === 0
  ) {
    return { valid: false, reason: "Missing order id, payment id or signature" };
  }

  const expected = createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return { valid: false, reason: "Signature length mismatch" };
  }

  const matches = timingSafeEqual(expectedBuffer, receivedBuffer);
  return matches
    ? { valid: true }
    : { valid: false, reason: "Signature does not match expected HMAC" };
}
