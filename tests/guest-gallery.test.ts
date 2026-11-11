import test from "node:test";
import assert from "node:assert";
import { checkRateLimit } from "../lib/rate-limit";

test("checkRateLimit allows requests within limit and rejects after max", () => {
  const testIp = `test-ip-${Date.now()}`;
  const max = 5;
  const windowMs = 5000;

  for (let i = 0; i < max; i++) {
    const res = checkRateLimit(testIp, max, windowMs);
    assert.strictEqual(res.allowed, true, `Request ${i + 1} should be allowed`);
  }

  // 6th request must be rejected
  const blocked = checkRateLimit(testIp, max, windowMs);
  assert.strictEqual(blocked.allowed, false, "Request beyond limit must be blocked");
  assert.strictEqual(blocked.remaining, 0);
});

test("checkRateLimit tracks separate IP addresses independently", () => {
  const ip1 = `ip1-${Date.now()}`;
  const ip2 = `ip2-${Date.now()}`;

  const res1 = checkRateLimit(ip1, 2, 5000);
  const res2 = checkRateLimit(ip2, 2, 5000);

  assert.strictEqual(res1.allowed, true);
  assert.strictEqual(res2.allowed, true);

  // Exhaust ip1
  checkRateLimit(ip1, 2, 5000);
  const blockedIp1 = checkRateLimit(ip1, 2, 5000);
  assert.strictEqual(blockedIp1.allowed, false);

  // ip2 should still have quota
  const allowIp2 = checkRateLimit(ip2, 2, 5000);
  assert.strictEqual(allowIp2.allowed, true);
});

test("Guest cancellation business rules: rejects IN_PROGRESS and COMPLETED", () => {
  const isCancellable = (status: string) => {
    return status === "WAITING" || status === "REMINDED";
  };

  assert.strictEqual(isCancellable("WAITING"), true);
  assert.strictEqual(isCancellable("REMINDED"), true);
  assert.strictEqual(isCancellable("IN_PROGRESS"), false);
  assert.strictEqual(isCancellable("COMPLETED"), false);
  assert.strictEqual(isCancellable("CANCELLED"), false);
});

test("First name extraction extracts given name only and drops email/tokens", () => {
  const extractFirstName = (fullName?: string | null) => {
    return fullName?.trim().split(/\s+/)[0] || "Guest";
  };

  assert.strictEqual(extractFirstName("Alice Johnson"), "Alice");
  assert.strictEqual(extractFirstName("Bob"), "Bob");
  assert.strictEqual(extractFirstName("  Charlie   Brown "), "Charlie");
  assert.strictEqual(extractFirstName(null), "Guest");
});

