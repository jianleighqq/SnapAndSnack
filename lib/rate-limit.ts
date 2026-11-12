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
 * Failed login attempts tracking (Max 5 wrong attempts per IP per 10 minutes)
 */
const loginFailuresMap = new Map<string, RateLimitRecord>();
const LOGIN_LOCKOUT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_LOGIN_ATTEMPTS = 5;

/**
 * Checks whether an IP is currently locked out from attempting to login.
 */
export function checkLoginRateLimit(ip: string): {
  allowed: boolean;
  failedCount: number;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const record = loginFailuresMap.get(ip);

  if (!record || now > record.resetAt) {
    if (record && now > record.resetAt) {
      loginFailuresMap.delete(ip);
    }
    return {
      allowed: true,
      failedCount: 0,
      remaining: MAX_LOGIN_ATTEMPTS,
      resetAt: 0,
    };
  }

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    return {
      allowed: false,
      failedCount: record.count,
      remaining: 0,
      resetAt: record.resetAt,
    };
  }

  return {
    allowed: true,
    failedCount: record.count,
    remaining: MAX_LOGIN_ATTEMPTS - record.count,
    resetAt: record.resetAt,
  };
}

/**
 * Records a failed login attempt for an IP.
 */
export function recordLoginFailure(ip: string): {
  allowed: boolean;
  failedCount: number;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  let record = loginFailuresMap.get(ip);

  if (!record || now > record.resetAt) {
    record = {
      count: 1,
      resetAt: now + LOGIN_LOCKOUT_WINDOW_MS,
    };
    loginFailuresMap.set(ip, record);
  } else {
    record.count += 1;
  }

  const allowed = record.count < MAX_LOGIN_ATTEMPTS;
  return {
    allowed,
    failedCount: record.count,
    remaining: Math.max(0, MAX_LOGIN_ATTEMPTS - record.count),
    resetAt: record.resetAt,
  };
}

/**
 * Resets failed login attempts upon successful authentication.
 */
export function resetLoginAttempts(ip: string): void {
  loginFailuresMap.delete(ip);
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

/**
 * Rate limit for public booth operations: 120 requests per minute per IP.
 */
export function checkBoothRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  return checkRateLimit(`booth:${ip}`, 120, 60_000);
}

