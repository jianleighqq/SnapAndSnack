import { test } from "node:test";
import assert from "node:assert";
import {
  createSessionToken,
  verifySessionToken,
  getSafeRedirectTarget,
  SESSION_COOKIE_NAME,
} from "../lib/auth";

test("Unauthenticated session verification returns false and authenticated returns true", async () => {
  const secret = "test-secret-long-enough-32-chars-test";

  // No cookie
  assert.strictEqual(await verifySessionToken(null, secret), null);

  // Valid cookie
  const validToken = await createSessionToken(secret);
  const payload = await verifySessionToken(validToken, secret);
  assert.ok(payload !== null);
  assert.strictEqual(payload?.role, "operator");
});

test("Redirect targets are sanitized against open redirect exploits", () => {
  assert.strictEqual(getSafeRedirectTarget("/booth"), "/booth");
  assert.strictEqual(getSafeRedirectTarget("/booth/shoot"), "/booth/shoot");
  assert.strictEqual(getSafeRedirectTarget("https://malicious.com"), "/admin/queue");
  assert.strictEqual(getSafeRedirectTarget("//malicious.com"), "/admin/queue");
  assert.strictEqual(getSafeRedirectTarget("javascript:alert(1)"), "/admin/queue");
  assert.strictEqual(getSafeRedirectTarget("/"), "/");
});

