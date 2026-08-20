import { z } from "zod";

/**
 * Structured purchase intent. This is the ONLY shape the LLM (or fallback
 * parser) may produce, and it must pass this schema before anything else
 * happens. The LLM never decides prices, stock, or payment outcomes.
 */
export const cartItemSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().min(1).max(5),
});

export type CartItem = z.infer<typeof cartItemSchema>;

export const purchaseIntentSchema = z.object({
  items: z.array(cartItemSchema).min(1).max(5),
  maxBudgetPaise: z.number().int().positive().optional(),
  clarificationNeeded: z.boolean(),
  clarificationQuestion: z.string().optional(),
});

export type PurchaseIntent = z.infer<typeof purchaseIntentSchema>;

/** POST /api/agent/interpret */
export const interpretRequestSchema = z.object({
  message: z.string().min(1).max(500),
});

export type InterpretRequest = z.infer<typeof interpretRequestSchema>;

export const interpretResponseSchema = z.object({
  intent: purchaseIntentSchema.nullable(),
  mode: z.enum(["llm", "fallback"]),
  clarification: z
    .object({
      question: z.string(),
    })
    .optional(),
});

export type InterpretResponse = z.infer<typeof interpretResponseSchema>;

/**
 * Machine-readable rejection codes produced by the deterministic policy
 * engine and surfaced verbatim in API responses + audit events.
 */
export const REJECTION_CODES = [
  "INVALID_INTENT",
  "INVALID_QUANTITY",
  "SKU_NOT_FOUND",
  "ITEM_INACTIVE",
  "OUT_OF_STOCK",
  "ITEM_LIMIT_EXCEEDED",
  "BUDGET_EXCEEDED",
  "MERCHANT_ORDER_LIMIT_EXCEEDED",
  "CONFIRMATION_REQUIRED",
  "DUPLICATE_ACTIVE_SESSION",
  "RAZORPAY_ORDER_CREATION_FAILED",
  "PAYMENT_SIGNATURE_INVALID",
  "PAYMENT_VERIFICATION_FAILED",
] as const;

export const rejectionCodeSchema = z.enum(REJECTION_CODES);
export type RejectionCode = (typeof REJECTION_CODES)[number];
