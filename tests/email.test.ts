import test from "node:test";
import assert from "node:assert/strict";
import { buildConfirmationEmailContent, sendRegistrationEmail } from "../lib/email";

test("buildConfirmationEmailContent generates exact subject and formatted queue number", () => {
  const content = buildConfirmationEmailContent({
    firstName: "Sarah",
    queueNumber: 7,
    eventName: "Gala Night 2026",
    guestToken: "tok-abc-12345",
  });

  // Subject requirement: "Your Snap & Snack queue number: #{queue_number}"
  assert.equal(content.subject, "Your Snap & Snack queue number: #07");

  // Multi-digit numbers
  const multiDigit = buildConfirmationEmailContent({
    firstName: "Marcus",
    queueNumber: 42,
    eventName: "Gala Night 2026",
    guestToken: "tok-xyz-67890",
  });
  assert.equal(multiDigit.subject, "Your Snap & Snack queue number: #42");
});

test("buildConfirmationEmailContent contains guest first name, event name, and ticket link in both HTML and text", () => {
  const content = buildConfirmationEmailContent({
    firstName: "Elena",
    queueNumber: 3,
    eventName: "Smith Wedding",
    guestToken: "elena-unique-token-999",
  });

  // Text version checks
  assert.equal(content.text.includes("Hi Elena"), true);
  assert.equal(content.text.includes("Smith Wedding"), true);
  assert.equal(content.text.includes("#03"), true);
  assert.equal(content.text.includes("/guest?token=elena-unique-token-999"), true);
  assert.equal(content.text.includes("Open your ticket"), true);

  // HTML version checks
  assert.equal(content.html.includes("Elena"), true);
  assert.equal(content.html.includes("Smith Wedding"), true);
  assert.equal(content.html.includes("#03"), true);
  assert.equal(content.html.includes("/guest?token=elena-unique-token-999"), true);
  assert.equal(content.html.includes("Open my ticket"), true);

  // No secrets or other credentials included
  assert.equal(content.html.includes("WEBHOOK_SECRET"), false);
  assert.equal(content.html.includes("SERVICE_ROLE"), false);
  assert.equal(content.html.includes("OPERATOR_PIN"), false);
});

test("sendRegistrationEmail safely skips and returns success when no email provider is configured", async () => {
  const origSmtpUser = process.env.SMTP_USER;
  const origSmtpPass = process.env.SMTP_PASS;
  const origResend = process.env.RESEND_API_KEY;

  try {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.RESEND_API_KEY;

    const result = await sendRegistrationEmail({
      to: "guest@example.com",
      firstName: "Alex",
      queueNumber: 5,
      eventName: "Summer Fest",
      guestToken: "tok-alex-555",
    });

    assert.equal(result.success, true);
    assert.equal(result.provider, "skipped");
  } finally {
    if (origSmtpUser) process.env.SMTP_USER = origSmtpUser;
    if (origSmtpPass) process.env.SMTP_PASS = origSmtpPass;
    if (origResend) process.env.RESEND_API_KEY = origResend;
  }
});
