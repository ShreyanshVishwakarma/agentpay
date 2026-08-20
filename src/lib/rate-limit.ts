/**
 * Minimal in-memory sliding-window rate limiter. Sufficient for a
 * single-instance demo; swap for Redis/upstash in production.
 */
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const windows = new Map<string, number[]>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;

export function rateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const timestamps = (windows.get(key) ?? []).filter((ts) => ts > windowStart);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldest = timestamps[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)),
    };
  }

  timestamps.push(now);
  windows.set(key, timestamps);

  // Opportunistic cleanup to keep memory bounded.
  if (windows.size > 500) {
    for (const [mapKey, tsList] of windows) {
      if (tsList.every((ts) => ts <= windowStart)) {
        windows.delete(mapKey);
      }
    }
  }

  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_WINDOW - timestamps.length,
    retryAfterSeconds: 0,
  };
}
