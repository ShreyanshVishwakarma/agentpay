import type { PurchaseIntent } from "@/schemas/agent";

/** Response shapes returned by AgentPay's own API routes. */

export interface InterpretOk {
  intent: PurchaseIntent;
  mode: "llm" | "fallback";
}

export interface ApiError {
  code: string;
  message: string;
}

export interface PreviewItem {
  sku: string;
  itemName: string;
  unitPricePaise: number;
  formattedUnitPrice: string;
  quantity: number;
  lineTotalPaise: number;
  formattedLineTotal: string;
}

export interface PreviewApproved {
  status: "AWAITING_CONFIRMATION";
  sessionId: string;
  cartHash: string;
  items: PreviewItem[];
  totalPaise: number;
  formattedTotal: string;
  budgetPaise: number | null;
  remainingBudgetPaise: number | null;
  policyExplanation: string[];
  reusedSession: boolean;
  razorpayOrderCreated: false;
}

export interface PreviewRejected {
  status: "REJECTED";
  sessionId: string;
  reason: string;
  message: string;
  razorpayOrderCreated: false;
  suggestedAction: string;
}

export type PreviewResponse = PreviewApproved | PreviewRejected;

export interface ConfirmOrderCreated {
  status: "ORDER_CREATED";
  sessionId: string;
  reused: boolean;
  razorpayOrderCreated: true;
  razorpay: {
    keyId: string;
    orderId: string;
    amountPaise: number;
    currency: string;
    merchantName: string;
    testMode: true;
  };
}

export interface ConfirmRejected {
  status: "REJECTED";
  sessionId: string;
  reason: string;
  message: string;
  razorpayOrderCreated: false;
  suggestedAction: string;
}

export type ConfirmResponse =
  | ConfirmOrderCreated
  | ConfirmRejected
  | { error: ApiError };

export interface VerifyResponse {
  verified: boolean;
  status: string;
  sessionId: string;
  razorpayPaymentId?: string;
  reason?: string;
  message?: string;
}

export interface AuditEventDto {
  id: string;
  eventType: string;
  actor: string;
  payload: unknown;
  previousHash: string | null;
  eventHash: string;
  createdAt: string;
}

export interface AuditFeedResponse {
  session: {
    id: string;
    status: string;
    totalPaise: number;
    currency: string;
    buyerBudgetPaise: number | null;
    razorpayOrderId: string | null;
    razorpayPaymentId: string | null;
    rejectionReason: string | null;
  };
  events: AuditEventDto[];
  chainVerification: {
    valid: boolean;
    checkedCount: number;
    brokenAtEventId?: string;
    reason?: string;
  };
}

/** Minimal typings for the Razorpay Standard Checkout browser API. */
export interface RazorpayCheckoutResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayHandlerOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  theme?: { color?: string };
  handler: (response: RazorpayCheckoutResponse) => void;
  modal?: { ondismiss?: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayHandlerOptions) => { open: () => void };
  }
}
