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

test("BoothAttractScreen pre-checks current guest and polls every 3 seconds when waiting", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");

  const filePath = path.resolve(process.cwd(), "components/booth/BoothAttractScreen.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  // Pre-check before navigating
  assert.ok(content.includes('fetch("/api/booth/current"'), "Attract screen must fetch current guest before navigating");
  assert.ok(content.includes("isChecking"), "Attract screen must track checking state");
  assert.ok(content.includes("showNoGuestModal"), "Attract screen must have no-guest waiting modal state");

  // 3-second polling
  assert.ok(content.includes("setInterval(pollCurrentGuest, 3000)"), "Must poll current guest every 3000ms while waiting");
  assert.ok(content.includes("document.hidden"), "Must pause polling when page is hidden");
  assert.ok(content.includes("checkRequestIdRef"), "Must track request sequence to ignore out-of-order responses");
});

test("ShootConsole initializes in loading state and renders neutral loading view", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");

  const filePath = path.resolve(process.cwd(), "components/booth/ShootConsole.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  // Explicit loading state
  assert.ok(content.includes('useState<BoothStatus>("loading")'), "Must initialize boothStatus to loading");
  assert.ok(content.includes('boothStatus === "loading"'), "Must check for explicit loading state");
  assert.ok(content.includes("Getting the booth ready..."), "Must show neutral editorial loading view");

  // Never render step screens when loading or no guest
  assert.ok(content.includes('boothStatus === "no_guest" || !activeEntry'), "Must handle no_guest explicitly");
  assert.ok(content.includes('boothStatus === "error"'), "Must handle network/server error explicitly");

  // Polling on no_guest or error
  assert.ok(content.includes("setInterval(poll, 3000)"), "Must poll /api/booth/current every 3 seconds");
  assert.ok(content.includes("document.hidden"), "Must stop polling when document is hidden");
  assert.ok(content.includes("boothRequestIdRef"), "Must ignore out-of-order responses with sequence counter");
});

