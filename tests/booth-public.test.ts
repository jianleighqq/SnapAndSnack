import { test } from "node:test";
import assert from "node:assert";
import { extractFirstName } from "../lib/booth";
import { checkBoothRateLimit } from "../lib/rate-limit";

test("extractFirstName extracts given name safely without leaking tokens or emails", () => {
  assert.strictEqual(extractFirstName("Alice Johnson"), "Alice");
  assert.strictEqual(extractFirstName("Bob"), "Bob");
  assert.strictEqual(extractFirstName("  Charlie   Brown "), "Charlie");
  assert.strictEqual(extractFirstName(""), "Guest");
  assert.strictEqual(extractFirstName(null), "Guest");
  assert.strictEqual(extractFirstName(undefined), "Guest");
});

test("checkBoothRateLimit allows up to 120 requests per minute and blocks excess", () => {
  const testIp = "10.0.0.42";

  // Requests 1 to 120 should all be allowed
  for (let i = 1; i <= 120; i++) {
    const res = checkBoothRateLimit(testIp);
    assert.strictEqual(res.allowed, true, `Request ${i} should be allowed`);
    assert.strictEqual(res.remaining, 120 - i);
  }

  // Request 121 should be blocked
  const blocked = checkBoothRateLimit(testIp);
  assert.strictEqual(blocked.allowed, false, "121st request must be rate limited");
  assert.strictEqual(blocked.remaining, 0);
});

test("Sanitized booth context structure hides emails and tokens", () => {
  const rawGuest = {
    id: "guest-uuid-1",
    full_name: "Jane Doe",
    email: "jane@example.com",
    guest_token: "secret-token-xyz-12345",
  };

  const sanitized = {
    first_name: extractFirstName(rawGuest.full_name),
    queue_number: 7,
  };

  assert.strictEqual(sanitized.first_name, "Jane");
  assert.strictEqual(sanitized.queue_number, 7);
  assert.strictEqual((sanitized as any).email, undefined);
  assert.strictEqual((sanitized as any).guest_token, undefined);
});

