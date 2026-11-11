import { verifyPin, createSessionToken, verifySessionToken } from "../lib/auth";
import { checkLoginRateLimit, recordLoginFailure, resetLoginAttempts } from "../lib/rate-limit";

async function verifyAuthFlow() {
  console.log("=== 1. VERIFY PIN CONSTANT TIME FUNCTION ===");
  const testPin = "7492";
  if (!verifyPin(testPin, "7492")) throw new Error("Expected matching PIN to return true");
  if (verifyPin("wrong", "7492")) throw new Error("Expected wrong PIN to return false");
  if (verifyPin("749", "7492")) throw new Error("Expected short PIN to return false");
  console.log("verifyPin tests: OK");

  console.log("\n=== 2. VERIFY TOKEN SIGNING & VERIFICATION ===");
  const secret = "test-secret-session-key-32-chars-long";
  const token = await createSessionToken(secret);
  console.log("Generated session token:", token.substring(0, 40) + "...");

  const verified = await verifySessionToken(token, secret);
  if (!verified || verified.role !== "operator") {
    throw new Error("Failed to verify valid session token");
  }
  console.log("Session verified successfully:", verified);

  const wrongSecret = await verifySessionToken(token, "different-secret-key-32-chars-ok");
  if (wrongSecret !== null) throw new Error("Token with wrong secret should be rejected");
  console.log("Rejection of invalid secret: OK");

  console.log("\n=== 3. VERIFY RATE LIMITING ON WRONG PIN ATTEMPTS ===");
  const testIp = "203.0.113.42";
  resetLoginAttempts(testIp);

  for (let i = 1; i <= 4; i++) {
    const attempt = recordLoginFailure(testIp);
    if (!attempt.allowed) throw new Error(`Attempt ${i} should be allowed`);
    console.log(`Failed attempt ${i}: remaining = ${attempt.remaining}`);
  }

  // 5th wrong attempt hits the lockout
  const fifthAttempt = recordLoginFailure(testIp);
  console.log("5th attempt status:", fifthAttempt);
  if (fifthAttempt.allowed) throw new Error("5th attempt should be blocked");

  const lockedStatus = checkLoginRateLimit(testIp);
  if (lockedStatus.allowed) throw new Error("IP should be locked out");
  console.log("Lockout active: OK");

  // Reset clears lockout
  resetLoginAttempts(testIp);
  const unlocked = checkLoginRateLimit(testIp);
  if (!unlocked.allowed) throw new Error("IP should be unlocked after reset");
  console.log("Lockout reset: OK");

  console.log("\nALL AUTHENTICATION CHECKS PASSED SUCCESSFULLY!");
}

verifyAuthFlow().then(() => process.exit(0)).catch((e) => {
  console.error("Auth verification failed:", e);
  process.exit(1);
});

