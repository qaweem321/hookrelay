// Delay before the next try, indexed by how many attempts have failed so far (1-based).
// Eight attempts span about a day: 10 s, 1 min, 5 min, 30 min, 2 h, 6 h, 12 h.
export const RETRY_SCHEDULE_SECONDS = [10, 60, 300, 1800, 7200, 21600, 43200] as const;

const MAX_RETRY_AFTER_MS = 6 * 60 * 60 * 1000;

// ±20% jitter, so a destination that comes back up isn't hit by every queued delivery at once.
export function retryDelayMs(
  failedAttempts: number,
  random = Math.random,
  retryAfterMs: number | null = null,
): number {
  const index = Math.min(Math.max(failedAttempts, 1), RETRY_SCHEDULE_SECONDS.length) - 1;
  const base = RETRY_SCHEDULE_SECONDS[index]! * 1000;
  const delay = Math.round(base * (0.8 + 0.4 * random()));
  return retryAfterMs === null ? delay : Math.max(delay, Math.min(retryAfterMs, MAX_RETRY_AFTER_MS));
}

// Retry-After is either seconds or an HTTP date.
export function parseRetryAfter(value: string | string[] | undefined, now = Date.now()): number | null {
  const header = Array.isArray(value) ? value[0] : value;
  if (!header) return null;
  if (/^\d+$/.test(header.trim())) return Number(header.trim()) * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}
