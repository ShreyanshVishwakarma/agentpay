import { z } from "zod";

/**
 * Payload sent by the Razorpay Standard Checkout success handler and
 * verified server-side before any fulfillment.
 */
export const verifyPaymentRequestSchema = z.object({
  checkoutSessionId: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export type VerifyPaymentRequest = z.infer<typeof verifyPaymentRequestSchema>;

export const verifyPaymentResponseSchema = z.object({
  verified: z.boolean(),
  status: z.string(),
  sessionId: z.string(),
  razorpayPaymentId: z.string().optional(),
  reason: z.string().optional(),
});

export type VerifyPaymentResponse = z.infer<typeof verifyPaymentResponseSchema>;

/** Envelope of a Razorpay webhook delivery. */
export const razorpayWebhookEnvelopeSchema = z.object({
  event: z.string().min(1),
});

/** The payment entity embedded in payment.* / order.* webhook events. */
export const razorpayPaymentEntitySchema = z.object({
  id: z.string().min(1),
  order_id: z.string().min(1),
  amount: z.number().int().nonnegative(),
  status: z.string(),
});

export type RazorpayPaymentEntity = z.infer<typeof razorpayPaymentEntitySchema>;
