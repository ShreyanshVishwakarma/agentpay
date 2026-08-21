import { formatPaise } from "@/lib/money";

/**
 * Deterministic recovery intervention engine.
 *
 * NO LLM participates in this decision. Given a session's observable state,
 * the engine maps it onto exactly one bounded intervention using explicit,
 * ordered rules. Every output names the rule that produced it and the
 * merchant control that bounds it. No automatic payment is ever attempted.
 */

export const INTERVENTION_TYPES = [
  "RESUME_CHECKOUT",
  "SEND_PAYMENT_REMINDER",
  "OFFER_LOWER_PRICED_ALTERNATIVE",
  "OFFER_RESTOCK_NOTIFICATION",
  "REQUEST_BUDGET_INCREASE",
  "DO_NOT_CONTACT",
] as const;

export type InterventionType = (typeof INTERVENTION_TYPES)[number];

export const RECOVERY_CASE_STATUSES = [
  "NOT_ELIGIBLE",
  "ELIGIBLE",
  "PROPOSED",
  "MERCHANT_APPROVED",
  "ACTION_EXECUTED",
  "BUYER_REENGAGED",
  "RECOVERED",
  "STOPPED",
  "EXPIRED",
] as const;

export type RecoveryCaseStatus = (typeof RECOVERY_CASE_STATUSES)[number];

export interface InterventionInput {
  sessionStatus: string;
  failureReason: string | null;
  cartValuePaise: number;
  productName: string;
  inStock: boolean;
  alternative: { sku: string; name: string; pricePaise: number } | null;
  attemptCount: number;
  policy: {
    recoveryEnabled: boolean;
    maxRecoveryAttempts: number;
    coolingOffMinutesAfterFailures: number;
  };
  sessionAgeMinutes: number;
  budgetPaise: number | null;
}

export interface InterventionDecision {
  interventionType: InterventionType;
  eligibility: "ELIGIBLE" | "NOT_ELIGIBLE";
  reasonCodes: string[];
  humanExplanation: string;
  recommendedMessage: string;
  cooldownMinutes: number;
  expectedRecoveryValuePaise: number;
  /** Exact rule that generated this decision. */
  rule: string;
  /** Merchant control that bounds this intervention. */
  merchantBound: string;
  opportunityType:
    | "Abandoned checkout"
    | "Payment failure"
    | "Checkout expired"
    | "Out-of-stock requested item"
    | "Budget mismatch"
    | "Not applicable";
}

/**
 * Ordered rules — first match wins. Stopping rules are evaluated first so
 * no intervention can bypass them.
 */
export function decideIntervention(input: InterventionInput): InterventionDecision {
  const {
    sessionStatus,
    failureReason,
    cartValuePaise,
    productName,
    inStock,
    alternative,
    attemptCount,
    policy,
    sessionAgeMinutes,
    budgetPaise,
  } = input;

  // ---- Stopping rules ----------------------------------------------------
  if (!policy.recoveryEnabled) {
    return doNotContact(input, ["RECOVERY_DISABLED_BY_MERCHANT"], "R1_recovery_disabled", "recovery.recovery_enabled = false");
  }
  if (attemptCount >= policy.maxRecoveryAttempts) {
    return doNotContact(
      input,
      ["MAX_RECOVERY_ATTEMPTS_REACHED"],
      "R2_max_attempts",
      `recovery.max_recovery_attempts = ${policy.maxRecoveryAttempts}`,
    );
  }
  if (sessionAgeMinutes > 60 * 24 * 14) {
    return doNotContact(input, ["SESSION_TOO_OLD"], "R3_session_age", "recovery max session age = 14 days");
  }

  const cooldown = policy.coolingOffMinutesAfterFailures;

  // ---- Positive rules ----------------------------------------------------
  // Payment failed but product in stock and attempts < 2 → reminder.
  if (sessionStatus === "PAYMENT_FAILED" && inStock && attemptCount < 2) {
    return {
      interventionType: "SEND_PAYMENT_REMINDER",
      eligibility: "ELIGIBLE",
      reasonCodes: ["PAYMENT_FAILED", "IN_STOCK", "ATTEMPTS_UNDER_LIMIT"],
      humanExplanation: `Payment failed but "${productName}" is in stock and only ${attemptCount} recovery attempt(s) have been made.`,
      recommendedMessage: buildReminderMessage(productName, cartValuePaise),
      cooldownMinutes: cooldown,
      expectedRecoveryValuePaise: cartValuePaise,
      rule: "R10_payment_failed_in_stock",
      merchantBound: `max ${policy.maxRecoveryAttempts} attempts, ${cooldown}min cooldown`,
      opportunityType: "Payment failure",
    };
  }

  // Budget mismatch → ask buyer to raise budget (no discount invented).
  if (
    failureReason === "BUDGET_EXCEEDED" ||
    (budgetPaise !== null && cartValuePaise > budgetPaise && sessionStatus === "REJECTED")
  ) {
    return {
      interventionType: "REQUEST_BUDGET_INCREASE",
      eligibility: "ELIGIBLE",
      reasonCodes: ["BUDGET_EXCEEDED", "CART_VALUE_KNOWN"],
      humanExplanation: `The cart total ${formatPaise(cartValuePaise)} exceeded the buyer's stated budget${budgetPaise !== null ? ` of ${formatPaise(budgetPaise)}` : ""}. The buyer can approve a higher budget to continue.`,
      recommendedMessage: buildBudgetMessage(cartValuePaise, budgetPaise),
      cooldownMinutes: cooldown,
      expectedRecoveryValuePaise: cartValuePaise,
      rule: "R11_budget_mismatch",
      merchantBound: "buyer must explicitly approve any new budget; no auto-charging",
      opportunityType: "Budget mismatch",
    };
  }

  // Out of stock with an available alternative → offer it.
  if (
    !inStock &&
    alternative &&
    alternative.pricePaise <= cartValuePaise
  ) {
    return {
      interventionType: "OFFER_LOWER_PRICED_ALTERNATIVE",
      eligibility: "ELIGIBLE",
      reasonCodes: ["OUT_OF_STOCK", "ALTERNATIVE_AVAILABLE"],
      humanExplanation: `The requested item is out of stock, but "${alternative.name}" is available at ${formatPaise(alternative.pricePaise)}.`,
      recommendedMessage: `The item you wanted is sold out. "${alternative.name}" is available at ${formatPaise(alternative.pricePaise)} if you'd like it instead.`,
      cooldownMinutes: cooldown,
      expectedRecoveryValuePaise: alternative.pricePaise,
      rule: "R12_out_of_stock_alternative",
      merchantBound: "alternative must be in stock and priced at or below original cart",
      opportunityType: "Out-of-stock requested item",
    };
  }

  // Out of stock without alternative → restock notification only.
  if (!inStock) {
    return {
      interventionType: "OFFER_RESTOCK_NOTIFICATION",
      eligibility: "ELIGIBLE",
      reasonCodes: ["OUT_OF_STOCK", "NO_ALTERNATIVE"],
      humanExplanation: "The requested item is out of stock and no alternative matched. A restock notification carries no payment action.",
      recommendedMessage: "We'll let you know when the item you wanted is back in stock.",
      cooldownMinutes: cooldown,
      expectedRecoveryValuePaise: 0,
      rule: "R13_out_of_stock_restock_only",
      merchantBound: "notification only — no checkout can be created without stock",
      opportunityType: "Out-of-stock requested item",
    };
  }

  // Expired or abandoned after confirmation → resume.
  if (
    (sessionStatus === "EXPIRED" || sessionStatus === "ORDER_CREATED") &&
    inStock
  ) {
    return {
      interventionType: "RESUME_CHECKOUT",
      eligibility: "ELIGIBLE",
      reasonCodes: [sessionStatus === "EXPIRED" ? "SESSION_EXPIRED" : "CHECKOUT_ABANDONED", "IN_STOCK"],
      humanExplanation:
        sessionStatus === "EXPIRED"
          ? "The checkout session expired without payment. The cart can be re-validated and resumed."
          : "The buyer confirmed intent but never completed payment. The checkout can be resumed.",
      recommendedMessage: "Your checkout is still available — you can safely resume whenever you're ready.",
      cooldownMinutes: cooldown,
      expectedRecoveryValuePaise: cartValuePaise,
      rule: "R14_expired_or_abandoned",
      merchantBound: "resume still requires full policy re-check + explicit confirmation",
      opportunityType: sessionStatus === "EXPIRED" ? "Checkout expired" : "Abandoned checkout",
    };
  }

  return doNotContact(input, ["NO_MATCHING_RULE"], "R19_default_dnc", "default safe fallback");
}

function doNotContact(
  input: InterventionInput,
  reasonCodes: string[],
  rule: string,
  bound: string,
): InterventionDecision {
  return {
    interventionType: "DO_NOT_CONTACT",
    eligibility: "NOT_ELIGIBLE",
    reasonCodes,
    humanExplanation:
      reasonCodes.includes("MAX_RECOVERY_ATTEMPTS_REACHED")
        ? `Stopping rule reached: ${input.attemptCount} recovery attempts have already been made.`
        : reasonCodes.includes("RECOVERY_DISABLED_BY_MERCHANT")
          ? "Merchant policy has disabled recovery for this store."
          : "No bounded, compliant intervention applies to this session.",
    recommendedMessage: "",
    cooldownMinutes: 0,
    expectedRecoveryValuePaise: 0,
    rule,
    merchantBound: bound,
    opportunityType: "Not applicable",
  };
}

function buildReminderMessage(productName: string, cartValuePaise: number): string {
  return `Your checkout for the ${productName} (${formatPaise(cartValuePaise)}) was not completed. The item is still available — you can safely resume checkout when ready.`;
}

function buildBudgetMessage(cartValuePaise: number, budgetPaise: number | null): string {
  return `Your selected items total ${formatPaise(cartValuePaise)}, above your stated budget${budgetPaise !== null ? ` of ${formatPaise(budgetPaise)}` : ""}. If you approve a higher budget, your original cart is ready to check out.`;
}
