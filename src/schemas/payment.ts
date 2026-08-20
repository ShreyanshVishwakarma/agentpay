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
