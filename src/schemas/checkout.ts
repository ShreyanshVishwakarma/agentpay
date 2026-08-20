import { z } from "zod";
import { purchaseIntentSchema } from "@/schemas/agent";

/**
 * CheckoutSession.status. Stored as a string column because SQLite does not
 * support native Prisma enums; this schema is the source of truth.
 */
export const SESSION_STATUSES = [
  "DRAFT",
  "AWAITING_CONFIRMATION",
  "REJECTED",
  "ORDER_CREATED",
  "PAYMENT_PENDING",
  "PAYMENT_VERIFIED",
  "PAYMENT_FAILED",
  "EXPIRED",
] as const;

export const sessionStatusSchema = z.enum(SESSION_STATUSES);
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** Statuses that can still transition to a payment or be reused. */
export const ACTIVE_SESSION_STATUSES: readonly SessionStatus[] = [
  "AWAITING_CONFIRMATION",
  "ORDER_CREATED",
  "PAYMENT_PENDING",
];

export const previewRequestSchema = z.object({
  intent: purchaseIntentSchema,
});

export type PreviewRequest = z.infer<typeof previewRequestSchema>;

export const confirmRequestSchema = z.object({
  sessionId: z.string().min(1),
});

export type ConfirmRequest = z.infer<typeof confirmRequestSchema>;
