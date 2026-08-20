import { describe, expect, it } from "vitest";
import { computeEventHash, verifyHashChain } from "@/lib/audit/hash-chain";
import type { ChainEvent } from "@/lib/audit/hash-chain";

function makeEvent(
  id: string,
  eventType: string,
  payload: Record<string, unknown>,
  previousHash: string | null,
): ChainEvent {
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

describe("verifyHashChain", () => {
  it("accepts an intact chain", () => {
    const e1 = makeEvent("e1", "INTENT_RECEIVED", { n: 1 }, null);
    const e2 = makeEvent("e2", "POLICY_APPROVED", { n: 2 }, e1.eventHash);
    const e3 = makeEvent("e3", "BUYER_CONFIRMED", { n: 3 }, e2.eventHash);

    const result = verifyHashChain([e1, e2, e3]);
    expect(result.valid).toBe(true);
    expect(result.checkedCount).toBe(3);
  });

  it("accepts an empty chain", () => {
    expect(verifyHashChain([]).valid).toBe(true);
  });

  it("detects a tampered payload and names the broken event", () => {
    const e1 = makeEvent("e1", "INTENT_RECEIVED", { n: 1 }, null);
    const e2 = makeEvent("e2", "POLICY_APPROVED", { n: 2 }, e1.eventHash);
    const e3 = makeEvent("e3", "BUYER_CONFIRMED", { n: 3 }, e2.eventHash);

    const tampered: ChainEvent = { ...e2, payload: { n: 999 } };
    const result = verifyHashChain([e1, tampered, e3]);
    expect(result.valid).toBe(false);
    expect(result.brokenAtEventId).toBe("e2");
  });

  it("detects deletion of a middle event via broken link", () => {
    const e1 = makeEvent("e1", "INTENT_RECEIVED", { n: 1 }, null);
    const e2 = makeEvent("e2", "POLICY_APPROVED", { n: 2 }, e1.eventHash);
    const e3 = makeEvent("e3", "BUYER_CONFIRMED", { n: 3 }, e2.eventHash);

    const result = verifyHashChain([e1, e3]);
    expect(result.valid).toBe(false);
    expect(result.brokenAtEventId).toBe("e3");
  });

  it("detects a forged genesis event claiming to be first", () => {
    const fake = makeEvent("fake", "INTENT_RECEIVED", { n: 1 }, null);
    const real = makeEvent("real", "INTENT_RECEIVED", { n: 1 }, null);
    // Same content but different ids do not matter; simulate forgery by
    // swapping previousHash linkage.
    const forged = { ...fake, previousHash: "nonexistent" };
    const result = verifyHashChain([forged, real]);
    expect(result.valid).toBe(false);
  });
});

describe("computeEventHash determinism", () => {
  it("is independent of object key insertion order", () => {
    const a = computeEventHash(null, {
      sessionId: "s1",
      eventType: "X",
      actor: "SYSTEM",
      payload: { b: 2, a: 1 },
    });
    const b = computeEventHash(null, {
      sessionId: "s1",
      eventType: "X",
      actor: "SYSTEM",
      payload: { a: 1, b: 2 },
    });
    expect(a).toBe(b);
  });

  it("changes when any hashed field changes", () => {
    const base = {
      sessionId: "s1",
      eventType: "X",
      actor: "SYSTEM",
      payload: { a: 1 } as Record<string, unknown>,
    };
    const original = computeEventHash(null, base);
    expect(computeEventHash(null, { ...base, payload: { a: 2 } })).not.toBe(original);
    expect(computeEventHash(null, { ...base, eventType: "Y" })).not.toBe(original);
    expect(computeEventHash(null, { ...base, actor: "BUYER" })).not.toBe(original);
    expect(computeEventHash("prev", base)).not.toBe(original);
  });

  it("treats null previousHash as the genesis link", () => {
    const genesis = computeEventHash(null, {
      sessionId: "s1",
      eventType: "X",
      actor: "SYSTEM",
      payload: {},
    });
    expect(genesis).toMatch(/^[a-f0-9]{64}$/);
  });
});
