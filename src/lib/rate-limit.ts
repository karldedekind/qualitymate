type Bucket = {
  attempts: number[];
  lockedUntil: number | null;
};

const WINDOW_MS = 15 * 60 * 1000;
const COOLDOWN_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const buckets = new Map<string, Bucket>();

function bucketFor(key: string): Bucket {
  let b = buckets.get(key);
  if (!b) {
    b = { attempts: [], lockedUntil: null };
    buckets.set(key, b);
  }
  return b;
}

export type LimitResult =
  | { ok: true }
  | { ok: false; retryAfterMs: number };

export function check(key: string, now: number = Date.now()): LimitResult {
  const b = bucketFor(key);
  if (b.lockedUntil && b.lockedUntil > now) {
    return { ok: false, retryAfterMs: b.lockedUntil - now };
  }
  if (b.lockedUntil && b.lockedUntil <= now) {
    b.lockedUntil = null;
    b.attempts = [];
  }
  return { ok: true };
}

export function recordFailure(key: string, now: number = Date.now()): LimitResult {
  const b = bucketFor(key);
  b.attempts = b.attempts.filter((t) => now - t < WINDOW_MS);
  b.attempts.push(now);
  if (b.attempts.length >= MAX_ATTEMPTS) {
    b.lockedUntil = now + COOLDOWN_MS;
    return { ok: false, retryAfterMs: COOLDOWN_MS };
  }
  return { ok: true };
}

export function recordSuccess(key: string): void {
  buckets.delete(key);
}

export function checkLogin(ip: string, email: string, now: number = Date.now()): LimitResult {
  const ipResult = check(`ip:${ip}`, now);
  if (!ipResult.ok) return ipResult;
  return check(`email:${email.toLowerCase()}`, now);
}

export function recordLoginFailure(ip: string, email: string, now: number = Date.now()): LimitResult {
  const a = recordFailure(`ip:${ip}`, now);
  const b = recordFailure(`email:${email.toLowerCase()}`, now);
  if (!a.ok) return a;
  if (!b.ok) return b;
  return { ok: true };
}

export function recordLoginSuccess(ip: string, email: string): void {
  recordSuccess(`ip:${ip}`);
  recordSuccess(`email:${email.toLowerCase()}`);
}

type WindowBucket = { hits: number[] };
const windowBuckets = new Map<string, WindowBucket>();

export type ConsumeResult = { ok: true; remaining: number } | { ok: false; retryAfterMs: number };

export function consume(
  key: string,
  opts: { limit: number; windowMs: number; now?: number },
): ConsumeResult {
  const now = opts.now ?? Date.now();
  let b = windowBuckets.get(key);
  if (!b) {
    b = { hits: [] };
    windowBuckets.set(key, b);
  }
  b.hits = b.hits.filter((t) => now - t < opts.windowMs);
  if (b.hits.length >= opts.limit) {
    const oldest = b.hits[0]!;
    return { ok: false, retryAfterMs: opts.windowMs - (now - oldest) };
  }
  b.hits.push(now);
  return { ok: true, remaining: opts.limit - b.hits.length };
}

export function _resetForTests(): void {
  buckets.clear();
  windowBuckets.clear();
}
