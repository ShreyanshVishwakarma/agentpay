import { describe, expect, it } from "vitest";
import {
  auditRecoveryCopy,
  generateTemplateCopy,
  RECOVERY_COPY_VERSION,
} from "@/lib/agent/recovery-copy";
import type { InterventionDecision } from "@/lib/recovery/intervention-engine";

function decision(type: InterventionDecision["interventionType"]): InterventionDecision {
  return {
    interventionType: type,
    eligibility: "ELIGIBLE",
    reasonCodes: ["TEST"],
    humanExplanation: "",
    recommendedMessage: "",
    cooldownMinutes: 10,
    expectedRecoveryValuePaise: 39900,
    rule: "R10_test",
    merchantBound: "test",
    opportunityType: "Payment failure",
  };
}

const INPUT = {
  productName: "SQL Pro Interview Pack",
  unitPricePaise: 39900,
  merchantName: "SkillForge Learning",
  buyerRequestSummary: "[demo] Buy two SQL packs",
};

describe("generateTemplateCopy", () => {
  it("produces a polite reminder mentioning only the real price", () => {
    const message = generateTemplateCopy({ ...INPUT, decision: decision("SEND_PAYMENT_REMINDER") });
    expect(message).toContain("SQL Pro Interview Pack");
    expect(message).toContain("₹399.00");
    expect(auditRecoveryCopy(message, 39900)).toBeNull();
  });

  it("never claims a payment was completed", () => {
    for (const type of [
      "SEND_PAYMENT_REMINDER",
      "RESUME_CHECKOUT",
      "REQUEST_BUDGET_INCREASE",
      "OFFER_LOWER_PRICED_ALTERNATIVE",
      "OFFER_RESTOCK_NOTIFICATION",
    ] as const) {
      const message = generateTemplateCopy({ ...INPUT, decision: decision(type) });
      // The real guardrail: no false payment-status claim passes.
      expect(auditRecoveryCopy(message, INPUT.unitPricePaise)).toBeNull();
      expect(message.toLowerCase()).not.toContain("payment successful");
    }
  });

  it("DO_NOT_CONTACT produces empty copy", () => {
    expect(generateTemplateCopy({ ...INPUT, decision: decision("DO_NOT_CONTACT") })).toBe("");
  });
});

describe("recovery copy guardrails (auditRecoveryCopy)", () => {
  it("rejects false urgency", () => {
    expect(
      auditRecoveryCopy("Act now! Your item is waiting.", 39900),
    ).toBe("false urgency");
  });

  it("rejects fabricated discounts", () => {
    expect(
      auditRecoveryCopy("Good news — a discount has been applied to your checkout.", 39900),
    ).toBe("unauthorized discount");
  });

  it("rejects payment-completion claims", () => {
    expect(
      auditRecoveryCopy("Your payment was successful and your card has been charged.", 39900),
    ).toBe("false payment-status claim");
  });

  it("rejects requests for sensitive information", () => {
    expect(
      auditRecoveryCopy("Please share your card number to continue.", 39900),
    ).toBe("request for sensitive information");
  });

  it("rejects invented prices even when the tone is fine", () => {
    expect(
      auditRecoveryCopy("The SQL Pro Interview Pack is still available at ₹199.00.", 39900),
    ).toContain("invented price");
  });

  it("accepts an honest message with the exact real price", () => {
    expect(
      auditRecoveryCopy(
        "Your checkout for the SQL Pro Interview Pack was not completed. The item is still available at ₹399.00. You can safely resume checkout when ready.",
        39900,
      ),
    ).toBeNull();
  });

  it("tags every result with the copy version", () => {
    expect(RECOVERY_COPY_VERSION).toMatch(/^recovery-copy-v\d+$/);
  });
});
