import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyRazorpaySignature } from "@/lib/razorpay/verify-signature";

// tests/setup.ts sets RAZORPAY_KEY_SECRET="test_integration_secret".
const SECRET = process.env.RAZORPAY_KEY_SECRET as string;
const ORDER_ID = "order_NwfqHXdjQDkCLp";
const PAYMENT_ID = "pay_NxfhKdJnTSccAb";

function sign(payload: string, secret: string = SECRET): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

describe("verifyRazorpaySignature", () => {
  it("accepts a correctly signed payment", () => {
    const signature = sign(`${ORDER_ID}|${PAYMENT_ID}`);
    const result = verifyRazorpaySignature({
      razorpayOrderId: ORDER_ID,
      razorpayPaymentId: PAYMENT_ID,
      signature,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects a forged signature", () => {
    const signature = sign(`${ORDER_ID}|${PAYMENT_ID}`).replace("a", "b");
    const result = verifyRazorpaySignature({
      razorpayOrderId: ORDER_ID,
      razorpayPaymentId: PAYMENT_ID,
      signature,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects swapped order/payment pairing", () => {
    const signature = sign(`${PAYMENT_ID}|${ORDER_ID}`);
    const result = verifyRazorpaySignature({
      razorpayOrderId: ORDER_ID,
      razorpayPaymentId: PAYMENT_ID,
      signature,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const signature = sign(`${ORDER_ID}|${PAYMENT_ID}`, "attacker_secret");
    const result = verifyRazorpaySignature({
      razorpayOrderId: ORDER_ID,
      razorpayPaymentId: PAYMENT_ID,
      signature,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects empty or malformed inputs without throwing", () => {
    const signature = sign(`${ORDER_ID}|${PAYMENT_ID}`);
    for (const params of [
      { razorpayOrderId: "", razorpayPaymentId: PAYMENT_ID, signature },
      { razorpayOrderId: ORDER_ID, razorpayPaymentId: "", signature },
      { razorpayOrderId: ORDER_ID, razorpayPaymentId: PAYMENT_ID, signature: "" },
    ]) {
      expect(verifyRazorpaySignature(params).valid).toBe(false);
    }
  });
});
