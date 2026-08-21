import { sha256Hex, stableStringify } from "@/lib/hash-utils";

/**
 * Tamper-evident event chain.
 *
 *   eventHash = SHA-256( previousHash ?? "" + "|" + canonical(event) )
 *
 * The canonical event covers sessionId, eventType, actor and payload.
 * Timestamps are intentionally excluded from the hashed material because
 * SQLite datetime precision could make recomputation unstable; the chain
 * still guarantees that no stored event can be modified or removed
 * without breaking every subsequent link.
 */
export interface ChainEvent {
  id: string;
  sessionId: string | null;
  eventType: string;
  actor: string;
  payload: unknown;
  previousHash: string | null;
  eventHash: string;
}

export function computeEventHash(
  previousHash: string | null,
  event: {
    sessionId: string | null;
    eventType: string;
    actor: string;
    payload: unknown;
  },
): string {
  const canonical = stableStringify({
    sessionId: event.sessionId,
    eventType: event.eventType,
    actor: event.actor,
    payload: event.payload ?? null,
  });
  return sha256Hex(`${previousHash ?? ""}|${canonical}`);
}

export interface ChainVerificationResult {
  valid: boolean;
  checkedCount: number;
  brokenAtEventId?: string;
  reason?: string;
}

/** Recompute the full chain for an ordered list of events. */
export function verifyHashChain(events: ChainEvent[]): ChainVerificationResult {
  let previousHash: string | null = null;

  for (const event of events) {
    if (event.previousHash !== previousHash) {
      return {
        valid: false,
        checkedCount: events.length,
        brokenAtEventId: event.id,
        reason: "Previous-hash link does not match the preceding event.",
      };
    }

    const expected = computeEventHash(previousHash, event);
    if (expected !== event.eventHash) {
      return {
        valid: false,
        checkedCount: events.length,
        brokenAtEventId: event.id,
        reason: "Stored event hash does not match recomputed content hash.",
      };
    }

    previousHash = event.eventHash;
  }

  return { valid: true, checkedCount: events.length };
}
