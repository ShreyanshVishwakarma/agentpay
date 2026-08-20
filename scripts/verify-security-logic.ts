/* Scratch verification of hash-chain tamper evidence + HMAC signature logic.
   Run: npx tsx scripts/verify-security-logic.ts */
import { createHmac, timingSafeEqual } from "node:crypto";
import { computeEventHash, verifyHashChain } from "../src/lib/audit/hash-chain";

function makeEvent(
  id: string,
  eventType: string,
  payload: Record<string, unknown>,
  previousHash: string | null,
) {
  return {
    id,
    sessionId: "s1",
    eventType,
    actor: "SYSTEM",
    payload,
    previousHash,
    eventHash: computeEventHash(previousHash, {
      sessionId: "s1",
      eventType,
      actor: "SYSTEM",
      payload,
    }),
  };
}

// --- Chain integrity -------------------------------------------------------
const e1 = makeEvent("e1", "INTENT_RECEIVED", { n: 1 }, null);
const e2 = makeEvent("e2", "POLICY_APPROVED", { n: 2 }, e1.eventHash);
const e3 = makeEvent("e3", "BUYER_CONFIRMED", { n: 3 }, e2.eventHash);
console.log("intact chain:", verifyHashChain([e1, e2, e3]).valid === true);

// Tamper with a payload in the middle of the chain.
const tampered = { ...e2, payload: { n: 999 } };
const tamperResult = verifyHashChain([e1, tampered, e3]);
console.log(
  "tampered payload detected:",
  tamperResult.valid === false && tamperResult.brokenAtEventId === "e2",
);

// Delete an event from the middle.
const deletionResult = verifyHashChain([e1, e3]);
console.log(
  "deleted event detected:",
  deletionResult.valid === false && deletionResult.brokenAtEventId === "e3",
);

// Key-order independence: same data, different insertion order.
const reordered = computeEventHash(null, {
  sessionId: "s1",
  eventType: "X",
  actor: "SYSTEM",
  payload: { b: 2, a: 1 },
});
const canonical = computeEventHash(null, {
  sessionId: "s1",
  eventType: "X",
  actor: "SYSTEM",
  payload: { a: 1, b: 2 },
});
console.log("stable serialization:", reordered === canonical);

// --- Signature verification (mirrors verify-signature.ts) ------------------
const secret = "test_secret";
const orderId = "order_NwfqHXdjQDkCLp";
const paymentId = "pay_NxfhKdJnTSccAb";
const validSig = createHmac("sha256", secret)
  .update(`${orderId}|${paymentId}`)
  .digest("hex");

function check(sig: string): boolean {
  const expected = createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

console.log("valid signature accepted:", check(validSig) === true);
console.log("forged signature rejected:", check(validSig.replace("a", "b")) === false);
console.log("wrong-pairing rejected:", check(createHmac("sha256", secret).update(`${paymentId}|${orderId}`).digest("hex")) === false);
