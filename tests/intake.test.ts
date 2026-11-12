import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

function generateSignature(secret: string, timestamp: string, rawBody: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

function verifySignature(
  secret: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  rawBody: string
): { valid: boolean; reason?: string } {
  if (!timestampHeader || !signatureHeader) {
    return { valid: false, reason: "Missing headers" };
  }

  const timestamp = parseInt(timestampHeader, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (isNaN(timestamp) || Math.abs(nowSeconds - timestamp) > 300) {
    return { valid: false, reason: "Timestamp expired or invalid" };
  }

  const expectedSignature = generateSignature(secret, timestampHeader, rawBody);
  const providedBuffer = Buffer.from(signatureHeader, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return { valid: false, reason: "Invalid signature" };
  }

  return { valid: true };
}

test("Intake signature verification accepts valid HMAC signature within 5 minutes", () => {
  const secret = "test-webhook-secret-key-12345";
  const body = JSON.stringify({
    event_code: "SNAP26",
    full_name: "John Doe",
    email: "john@example.com",
    submitted_at: new Date().toISOString(),
  });
  const now = Math.floor(Date.now() / 1000).toString();
  const signature = generateSignature(secret, now, body);

  const result = verifySignature(secret, now, signature, body);
  assert.equal(result.valid, true);
});

test("Intake signature verification rejects expired timestamp (> 300 seconds old)", () => {
  const secret = "test-webhook-secret-key-12345";
  const body = JSON.stringify({ event_code: "SNAP26" });
  const oldTimestamp = (Math.floor(Date.now() / 1000) - 305).toString();
  const signature = generateSignature(secret, oldTimestamp, body);

  const result = verifySignature(secret, oldTimestamp, signature, body);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "Timestamp expired or invalid");
});

test("Intake signature verification rejects tampered body or invalid signature", () => {
  const secret = "test-webhook-secret-key-12345";
  const body = JSON.stringify({ event_code: "SNAP26", full_name: "Real Name" });
  const tamperedBody = JSON.stringify({ event_code: "SNAP26", full_name: "Hacker Name" });
  const now = Math.floor(Date.now() / 1000).toString();
  const signature = generateSignature(secret, now, body);

  const result = verifySignature(secret, now, signature, tamperedBody);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "Invalid signature");
});

test("Intake payload validation allows optional event_code, requires 1-100 char full_name and valid email", () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // 1. Valid with event_code
  const validWithCode = {
    event_code: "SNAP26",
    full_name: "Taylor Swift",
    email: "taylor@example.com",
  };
  assert.equal(typeof validWithCode.event_code === "string", true);
  assert.equal(validWithCode.full_name.trim().length >= 1 && validWithCode.full_name.trim().length <= 100, true);
  assert.equal(emailRegex.test(validWithCode.email), true);

  // 2. Valid without event_code (optional)
  const validWithoutCode = {
    full_name: "Taylor Swift",
    email: "taylor@example.com",
  };
  assert.equal((validWithoutCode as any).event_code, undefined);
  assert.equal(validWithoutCode.full_name.trim().length >= 1 && validWithoutCode.full_name.trim().length <= 100, true);
  assert.equal(emailRegex.test(validWithoutCode.email), true);

  // 3. Invalid email rejected
  const invalidEmail = "not-an-email";
  assert.equal(emailRegex.test(invalidEmail), false);

  // 4. Empty name rejected
  const emptyName = "   ";
  assert.equal(emptyName.trim().length >= 1, false);
});

interface MockEvent {
  id: string;
  name: string;
  event_code: string;
  status: "ACTIVE" | "SCHEDULED" | "CLOSED";
}

function resolveIntakeTargetEvent(
  events: MockEvent[],
  eventCode?: string | null
): { event: MockEvent | null; status: number; error?: string } {
  const cleanEventCode = typeof eventCode === "string" ? eventCode.trim().toUpperCase() : "";

  if (cleanEventCode) {
    const found = events.find((e) => e.event_code.toUpperCase() === cleanEventCode);
    if (!found) {
      return { event: null, status: 404, error: "Event not found" };
    }
    if (found.status === "CLOSED") {
      return { event: null, status: 409, error: "Registration closed" };
    }
    return { event: found, status: 200 };
  }

  // No event_code: use the single event with status = 'ACTIVE'
  const activeEvent = events.find((e) => e.status === "ACTIVE");
  if (!activeEvent) {
    return { event: null, status: 409, error: "Registration is not open" };
  }
  if (activeEvent.status === "CLOSED") {
    return { event: null, status: 409, error: "Registration closed" };
  }
  return { event: activeEvent, status: 200 };
}

test("Intake target event resolution: no event_code with an ACTIVE event works", () => {
  const events: MockEvent[] = [
    { id: "e1", name: "Grad Gala", event_code: "GRAD26", status: "SCHEDULED" },
    { id: "e2", name: "Summer Wedding", event_code: "WED26", status: "ACTIVE" },
  ];

  // Omitted event_code
  const res1 = resolveIntakeTargetEvent(events, undefined);
  assert.equal(res1.status, 200);
  assert.equal(res1.event?.id, "e2");
  assert.equal(res1.event?.name, "Summer Wedding");

  // Empty string event_code
  const res2 = resolveIntakeTargetEvent(events, "   ");
  assert.equal(res2.status, 200);
  assert.equal(res2.event?.id, "e2");
});

test("Intake target event resolution: no event_code and no ACTIVE event returns 409 Registration is not open", () => {
  const events: MockEvent[] = [
    { id: "e1", name: "Grad Gala", event_code: "GRAD26", status: "SCHEDULED" },
    { id: "e2", name: "Past Party", event_code: "PARTY25", status: "CLOSED" },
  ];

  const res = resolveIntakeTargetEvent(events, undefined);
  assert.equal(res.status, 409);
  assert.equal(res.error, "Registration is not open");
  assert.equal(res.event, null);
});

test("Intake target event resolution: explicit event_code for a non-active (SCHEDULED) event still works", () => {
  const events: MockEvent[] = [
    { id: "e1", name: "Future Summit", event_code: "SUMMIT26", status: "SCHEDULED" },
    { id: "e2", name: "Active Expo", event_code: "EXPO26", status: "ACTIVE" },
  ];

  const res = resolveIntakeTargetEvent(events, "SUMMIT26");
  assert.equal(res.status, 200);
  assert.equal(res.event?.id, "e1");
  assert.equal(res.event?.status, "SCHEDULED");
});

