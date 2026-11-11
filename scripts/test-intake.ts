/**
 * Test Intake Webhook Script
 *
 * Signs and sends a sample registration request to POST /api/intake,
 * simulating the webhook call from Google Apps Script.
 *
 * Usage:
 *   npx tsx scripts/test-intake.ts
 *   npx tsx scripts/test-intake.ts [event_code] [full_name] [email]
 */

import crypto from "crypto";
import * as fs from "fs";

// Load environment variables from .env.local
function loadEnv() {
  const envFile = fs.existsSync(".env.local")
    ? ".env.local"
    : fs.existsSync(".env")
    ? ".env"
    : null;
  if (!envFile) return;

  const content = fs.readFileSync(envFile, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key && rest.length > 0) {
      const val = rest.join("=").trim().replace(/^["'](.*)["']$/, "$1");
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = val;
      }
    }
  }
}

loadEnv();

async function main() {
  const secret = process.env.INTAKE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Error: INTAKE_WEBHOOK_SECRET is not configured in .env.local");
    process.exit(1);
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const url = `${baseUrl}/api/intake`;

  const eventCode = (process.argv[2] || "SNAP26").trim().toUpperCase();
  const fullName = (process.argv[3] || "Alex Morgan").trim();
  const email = (process.argv[4] || `alex_${Date.now()}@example.com`).trim().toLowerCase();

  const payload = {
    event_code: eventCode,
    full_name: fullName,
    email: email,
    submitted_at: new Date().toISOString(),
  };

  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Create HMAC-SHA256 signature: hex(HMAC("${timestamp}.${rawBody}"))
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  console.log("--------------------------------------------------");
  console.log("Simulating Google Form webhook submission to:");
  console.log(`URL: ${url}`);
  console.log("Payload:", payload);
  console.log(`Headers: x-timestamp: ${timestamp}, x-signature: [${signature.slice(0, 8)}...]`);
  console.log("--------------------------------------------------");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-timestamp": timestamp,
        "x-signature": signature,
      },
      body: rawBody,
    });

    const status = response.status;
    const json = await response.json();

    console.log(`HTTP Status: ${status} ${response.statusText}`);
    console.log("Response body:", JSON.stringify(json, null, 2));

    if (response.ok) {
      console.log("\nSuccess! Guest registered and queued.");
      console.log(`Guest Token: ${json.guest_token}`);
      console.log(`Queue Number: #${json.queue_number}`);
      console.log(`Guest URL: ${baseUrl}/guest?token=${json.guest_token}`);
    } else {
      console.error("\nRequest failed with status", status);
    }
  } catch (err: any) {
    console.error("Failed to connect to dev server. Is 'npm run dev' running on port 3000?");
    console.error(err.message);
  }
}

main();

