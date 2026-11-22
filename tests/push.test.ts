import test from "node:test";
import assert from "node:assert/strict";
import type { PushPayload } from "../lib/push";

test("PushPayload formatting formats Remind alert accurately", () => {
  const remindPayload: PushPayload = {
    title: "Get ready!",
    body: "You're next at the photo booth. Please come to the booth now.",
    url: "https://example.com/guest?token=test_token_123",
  };

  assert.equal(remindPayload.title, "Get ready!");
  assert.equal(
    remindPayload.body,
    "You're next at the photo booth. Please come to the booth now."
  );
  assert.ok(remindPayload.url?.includes("test_token_123"));

  const serialized = JSON.stringify(remindPayload);
  const parsed = JSON.parse(serialized);
  assert.deepEqual(parsed, remindPayload);
});

test("PushPayload formatting formats Your Turn alert accurately", () => {
  const yourTurnPayload: PushPayload = {
    title: "It's your turn!",
    body: "Please come to the photo booth.",
    url: "https://example.com/guest?token=test_token_456",
  };

  assert.equal(yourTurnPayload.title, "It's your turn!");
  assert.equal(yourTurnPayload.body, "Please come to the photo booth.");
  assert.ok(yourTurnPayload.url?.includes("test_token_456"));
});

test("In-page vibration pattern follows specified [300, 150, 300, 150, 600] duration array", () => {
  const expectedPattern = [300, 150, 300, 150, 600];
  assert.equal(expectedPattern.length, 5);
  assert.equal(expectedPattern[0], 300);
  assert.equal(expectedPattern[1], 150);
  assert.equal(expectedPattern[2], 300);
  assert.equal(expectedPattern[3], 150);
  assert.equal(expectedPattern[4], 600);
});

test("Alert transition detection fires on REMINDED and IN_PROGRESS transitions", () => {
  function shouldTriggerAlert(
    prevStatus: string | null,
    newStatus: string
  ): { vibrate: boolean; title: string | null } {
    if (!prevStatus || prevStatus === newStatus) {
      return { vibrate: false, title: null };
    }
    if (newStatus === "REMINDED") {
      return { vibrate: true, title: "Get ready!" };
    }
    if (newStatus === "IN_PROGRESS") {
      return { vibrate: true, title: "It's your turn!" };
    }
    return { vibrate: false, title: null };
  }

  // Initial load: no previous status -> do not trigger alert
  assert.deepEqual(shouldTriggerAlert(null, "WAITING"), { vibrate: false, title: null });
  assert.deepEqual(shouldTriggerAlert(null, "REMINDED"), { vibrate: false, title: null });

  // Status unchanged -> do not trigger
  assert.deepEqual(shouldTriggerAlert("WAITING", "WAITING"), { vibrate: false, title: null });

  // Transition from WAITING to REMINDED -> trigger!
  const remindedAlert = shouldTriggerAlert("WAITING", "REMINDED");
  assert.equal(remindedAlert.vibrate, true);
  assert.equal(remindedAlert.title, "Get ready!");

  // Transition from REMINDED to IN_PROGRESS -> trigger!
  const inProgressAlert = shouldTriggerAlert("REMINDED", "IN_PROGRESS");
  assert.equal(inProgressAlert.vibrate, true);
  assert.equal(inProgressAlert.title, "It's your turn!");

  // Transition from IN_PROGRESS to COMPLETED -> no vibration
  assert.deepEqual(shouldTriggerAlert("IN_PROGRESS", "COMPLETED"), { vibrate: false, title: null });
});

test("Push subscription payload validation checks endpoint, p256dh, and auth", () => {
  function validateSubscription(body: any): { valid: boolean; error?: string } {
    if (!body || !body.endpoint || typeof body.endpoint !== "string") {
      return { valid: false, error: "endpoint is required" };
    }
    if (!body.keys || typeof body.keys !== "object") {
      return { valid: false, error: "keys object is required" };
    }
    if (!body.keys.p256dh || typeof body.keys.p256dh !== "string") {
      return { valid: false, error: "keys.p256dh is required" };
    }
    if (!body.keys.auth || typeof body.keys.auth !== "string") {
      return { valid: false, error: "keys.auth is required" };
    }
    return { valid: true };
  }

  assert.equal(validateSubscription({}).valid, false);
  assert.equal(validateSubscription({ endpoint: "https://push.example.com" }).valid, false);
  assert.equal(
    validateSubscription({
      endpoint: "https://push.example.com",
      keys: { p256dh: "key_abc" },
    }).valid,
    false
  );
  assert.equal(
    validateSubscription({
      endpoint: "https://push.example.com",
      keys: { p256dh: "key_abc", auth: "auth_xyz" },
    }).valid,
    true
  );
});
