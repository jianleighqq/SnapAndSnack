import { test } from "node:test";
import assert from "node:assert";
import {
  verifyPin,
  createSessionToken,
  verifySessionToken,
  SESSION_DURATION_MS,
} from "../lib/auth";
import {
  checkLoginRateLimit,
  recordLoginFailure,
  resetLoginAttempts,
} from "../lib/rate-limit";

test("verifyPin compares PINs accurately and safely", () => {
  const expected = "4829";

  assert.strictEqual(verifyPin("4829", expected), true);
  assert.strictEqual(verifyPin(" 4829 ", expected), true); // handles trimmed whitespace
  assert.strictEqual(verifyPin("0000", expected), false);
  assert.strictEqual(verifyPin("482", expected), false); // different length
  assert.strictEqual(verifyPin("48290", expected), false); // different length
  assert.strictEqual(verifyPin("", expected), false);
  assert.strictEqual(verifyPin("4829", undefined), false);
});

test("createSessionToken and verifySessionToken roundtrip cleanly", async () => {
  const secret = "super-secret-test-key-32-chars-long";
  const token = await createSessionToken(secret);

  assert.ok(token.includes("."), "Token should contain separator");

  const payload = await verifySessionToken(token, secret);
  assert.ok(payload !== null, "Token should be valid");
  assert.strictEqual(payload?.role, "operator");
  assert.ok(payload!.exp > Date.now(), "Token should not be expired");
});

test("verifySessionToken rejects tampered signature or invalid secret", async () => {
  const secret = "super-secret-test-key-32-chars-long";
  const token = await createSessionToken(secret);

  // Tamper with payload
  const [b64, sig] = token.split(".");
  const tampered = `${b64}tampered.${sig}`;
  assert.strictEqual(await verifySessionToken(tampered, secret), null);

  // Wrong secret
  assert.strictEqual(await verifySessionToken(token, "wrong-secret-key"), null);

  // Invalid format
  assert.strictEqual(await verifySessionToken("malformed-token", secret), null);
  assert.strictEqual(await verifySessionToken("", secret), null);
  assert.strictEqual(await verifySessionToken(null, secret), null);
});

test("Login rate limiter enforces max 5 failed attempts per IP and resets upon success", () => {
  const testIp = "192.168.1.99";

  // Initially clear
  resetLoginAttempts(testIp);
  const initial = checkLoginRateLimit(testIp);
  assert.strictEqual(initial.allowed, true);
  assert.strictEqual(initial.remaining, 5);

  // Record 4 failures
  for (let i = 1; i <= 4; i++) {
    const res = recordLoginFailure(testIp);
    assert.strictEqual(res.allowed, true, `Attempt ${i} should still be allowed`);
    assert.strictEqual(res.remaining, 5 - i);
  }

  // 5th failure: hits the limit
  const fifth = recordLoginFailure(testIp);
  assert.strictEqual(fifth.allowed, false, "5th failure should reach the limit");
  assert.strictEqual(fifth.remaining, 0);

  // Check rate limit status
  const locked = checkLoginRateLimit(testIp);
  assert.strictEqual(locked.allowed, false);
  assert.strictEqual(locked.remaining, 0);

  // Successful login resets the lockout
  resetLoginAttempts(testIp);
  const afterReset = checkLoginRateLimit(testIp);
  assert.strictEqual(afterReset.allowed, true);
  assert.strictEqual(afterReset.remaining, 5);
});

