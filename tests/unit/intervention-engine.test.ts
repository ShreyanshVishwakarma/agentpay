import { describe, expect, it } from "vitest";
import {
  decideIntervention,
  type InterventionInput,
} from "@/lib/recovery/intervention-engine";

const BASE_POLICY = {
  recoveryEnabled: true,
  maxRecoveryAttempts: 2,
  coolingOffMinutesAfterFailures: 10,
};

function base(overrides: Partial<InterventionInput>): InterventionInput {
  return {
    sessionStatus: "PAYMENT_FAILED",
    failureReason: null,
    cartValuePaise: 39900,
    productName: "SQL Pro Interview Pack",
    inStock: true,
    alternative: null,
    attemptCount: 0,
    policy: BASE_POLICY,
    sessionAgeMinutes: 60,
    budgetPaise: null,
    ...overrides,
  };
}

describe("decideIntervention — spec examples", () => {
  it("payment failed + in stock + attempts < 2 → SEND_PAYMENT_REMINDER", () => {
    const decision = decideIntervention(base({}));
    expect(decision.interventionType).toBe("SEND_PAYMENT_REMINDER");
    expect(decision.eligibility).toBe("ELIGIBLE");
    expect(decision.expectedRecoveryValuePaise).toBe(39900);
    expect(decision.rule).toBe("R10_payment_failed_in_stock");
  });

  it("requested product out of stock + related product available → OFFER_LOWER_PRICED_ALTERNATIVE", () => {
    const decision = decideIntervention(
      base({
        sessionStatus: "REJECTED",
        failureReason: "OUT_OF_STOCK",
        inStock: false,
        alternative: { sku: "database-design-pack", name: "Database Design Pack", pricePaise: 29900 },
      }),
    );
    expect(decision.interventionType).toBe("OFFER_LOWER_PRICED_ALTERNATIVE");
    expect(decision.expectedRecoveryValuePaise).toBe(29900);
    expect(decision.rule).toBe("R12_out_of_stock_alternative");
  });

  it("cart exceeded buyer budget → REQUEST_BUDGET_INCREASE", () => {
    const decision = decideIntervention(
      base({
        sessionStatus: "REJECTED",
        failureReason: "BUDGET_EXCEEDED",
        budgetPaise: 80000,
        cartValuePaise: 119700,
      }),
    );
    expect(decision.interventionType).toBe("REQUEST_BUDGET_INCREASE");
    expect(decision.rule).toBe("R11_budget_mismatch");
  });

  it("three failed recovery attempts → DO_NOT_CONTACT", () => {
    const decision = decideIntervention(base({ attemptCount: 3 }));
    expect(decision.interventionType).toBe("DO_NOT_CONTACT");
    expect(decision.eligibility).toBe("NOT_ELIGIBLE");
    expect(decision.reasonCodes).toContain("MAX_RECOVERY_ATTEMPTS_REACHED");
  });

  it("session expired without payment → RESUME_CHECKOUT", () => {
    const decision = decideIntervention(base({ sessionStatus: "EXPIRED" }));
    expect(decision.interventionType).toBe("RESUME_CHECKOUT");
    expect(decision.rule).toBe("R14_expired_or_abandoned");
  });
});

describe("decideIntervention — stopping rules and bounds", () => {
  it("merchant-disabled recovery blocks everything", () => {
    const decision = decideIntervention(
      base({ policy: { ...BASE_POLICY, recoveryEnabled: false } }),
    );
    expect(decision.interventionType).toBe("DO_NOT_CONTACT");
    expect(decision.reasonCodes).toContain("RECOVERY_DISABLED_BY_MERCHANT");
  });

  it("out of stock without alternative → restock notification with zero expected value", () => {
    const decision = decideIntervention(
      base({ sessionStatus: "REJECTED", failureReason: "OUT_OF_STOCK", inStock: false }),
    );
    expect(decision.interventionType).toBe("OFFER_RESTOCK_NOTIFICATION");
    expect(decision.expectedRecoveryValuePaise).toBe(0);
  });

  it("sessions older than 14 days are never contacted", () => {
    const decision = decideIntervention(base({ sessionAgeMinutes: 60 * 24 * 20 }));
    expect(decision.eligibility).toBe("NOT_ELIGIBLE");
    expect(decision.reasonCodes).toContain("SESSION_TOO_OLD");
  });

  it("every eligible decision names its rule and merchant bound", () => {
    const decision = decideIntervention(base({}));
    expect(decision.rule).toMatch(/^R\d+/);
    expect(decision.merchantBound.length).toBeGreaterThan(0);
  });
});
