/**
 * In-memory sliding window rate limiter
 * Protects public token endpoints from brute force attempts.
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const ipMap = new Map<string, RateLimitRecord>();

// Clean up stale entries periodically without keeping the Node event loop alive
if (typeof setInterval !== "undefined") {
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipMap.entries()) {
      if (now > record.resetAt) {
        ipMap.delete(ip);
      }
    }
  }, 60_000);
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    (cleanupTimer as any).unref();
  }
}

/**
 * Checks whether an IP has exceeded the allowed limit within the window.
 * @param ip Client IP address
 * @param maxRequests Maximum requests allowed within window (default 60)
 * @param windowMs Window duration in milliseconds (default 60,000ms = 1 min)
 * @returns { allowed: boolean, remaining: number, resetAt: number }
 */
export function checkRateLimit(
  ip: string,
  maxRequests: number = 60,
  windowMs: number = 60_000
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const record = ipMap.get(ip);

  if (!record || now > record.resetAt) {
    const newRecord: RateLimitRecord = {
      count: 1,
      resetAt: now + windowMs,
    };
    ipMap.set(ip, newRecord);
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt: newRecord.resetAt,
    };
  }

  if (record.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetAt,
    };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetAt: record.resetAt,
  };
}

/**
 * Extracts client IP from standard request headers.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}

