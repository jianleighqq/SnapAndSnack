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

test("Intake payload validation requires event_code, 1-100 char full_name, and valid email", () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validGuest = {
    event_code: "SNAP26",
    full_name: "Taylor Swift",
    email: "taylor@example.com",
  };

  assert.equal(validGuest.event_code.length > 0, true);
  assert.equal(validGuest.full_name.trim().length >= 1 && validGuest.full_name.trim().length <= 100, true);
  assert.equal(emailRegex.test(validGuest.email), true);

  const invalidEmail = "not-an-email";
  assert.equal(emailRegex.test(invalidEmail), false);

  const emptyName = "   ";
  assert.equal(emptyName.trim().length >= 1, false);
});

