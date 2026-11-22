import test from "node:test";
import assert from "node:assert";
import { GET as getTicketRoute } from "../app/api/admin/queue/ticket/route";
import { GET as getQueueRoute } from "../app/api/queue/route";
import { db } from "../lib/db";
import { createSessionToken, SESSION_COOKIE_NAME } from "../lib/auth";

const TEST_SECRET = "test-session-secret-at-least-32-chars-long!";

async function createAuthHeaders(): Promise<HeadersInit> {
  process.env.SESSION_SECRET = TEST_SECRET;
  const token = await createSessionToken(TEST_SECRET);
  return {
    cookie: `${SESSION_COOKIE_NAME}=${token}`,
  };
}

test("GET /api/admin/queue/ticket rejects unauthenticated requests with 401", async () => {
  const req = new Request("http://localhost:3000/api/admin/queue/ticket?queueId=test-123");
  const res = await getTicketRoute(req);
  assert.strictEqual(res.status, 401);
});

test("GET /api/admin/queue/ticket rejects missing queueId with 400", async () => {
  const headers = await createAuthHeaders();
  const req = new Request("http://localhost:3000/api/admin/queue/ticket", { headers });
  const res = await getTicketRoute(req);
  assert.strictEqual(res.status, 400);

  const data = await res.json();
  assert.strictEqual(data.error, "queueId query parameter is required");
});

test("GET /api/admin/queue/ticket returns 404 when queueId not found", async () => {
  // Stub getGuestTokenByQueueId to return null
  const origMethod = db.getGuestTokenByQueueId;
  db.getGuestTokenByQueueId = async () => null;

  try {
    const headers = await createAuthHeaders();
    const req = new Request("http://localhost:3000/api/admin/queue/ticket?queueId=non-existent-id", { headers });
    const res = await getTicketRoute(req);
    assert.strictEqual(res.status, 404);

    const data = await res.json();
    assert.strictEqual(data.error, "Guest or ticket token not found");
  } finally {
    db.getGuestTokenByQueueId = origMethod;
  }
});

test("GET /api/admin/queue/ticket returns formatted ticketUrl with guest_token", async () => {
  const origMethod = db.getGuestTokenByQueueId;
  const mockToken = "secure_guest_token_abc_123";
  db.getGuestTokenByQueueId = async (id: string) => {
    if (id === "queue_valid_123") return mockToken;
    return null;
  };

  try {
    const headers = await createAuthHeaders();
    const req = new Request("http://localhost:3000/api/admin/queue/ticket?queueId=queue_valid_123", { headers });
    const res = await getTicketRoute(req);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.guestToken, mockToken);
    assert.ok(data.ticketUrl.includes(`/guest?token=${mockToken}`));
  } finally {
    db.getGuestTokenByQueueId = origMethod;
  }
});

test("GET /api/queue sanitizes guest_token to empty string for all entries", async () => {
  const origGetActiveEventWithQueue = db.getActiveEventWithQueue;
  db.getActiveEventWithQueue = async () => ({
    event: {
      id: "evt_1",
      name: "Test Event",
      event_type: "Wedding" as const,
      event_code: "TESTEVT",
      start_time: "2026-11-14T10:00:00Z",
      end_time: "2026-11-14T20:00:00Z",
      avg_shoot_minutes: 5,
      shots_per_guest: 3,
      max_retakes: 2,
      print_layout: "STRIP",
      max_prints_per_guest: 1,
      status: "ACTIVE",
    },
    queue: [
      {
        id: "q_1",
        event_id: "evt_1",
        guest_id: "g_1",
        queue_number: 1,
        scheduled_shoot_time: "2026-11-14T10:00:00Z",
        status: "WAITING",
        created_at: "2026-11-14T10:00:00Z",
        guest: {
          id: "g_1",
          event_id: "evt_1",
          full_name: "Alice Test",
          email: "alice@test.com",
          guest_token: "secret_token_never_expose_alice",
          created_at: "2026-11-14T10:00:00Z",
        },
      },
    ],
  });

  try {
    const res = await getQueueRoute();
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.ok(Array.isArray(data.queue));
    assert.strictEqual(data.queue.length, 1);
    // Crucial check: guest_token must be scrubbed / empty
    assert.strictEqual(data.queue[0].guest.guest_token, "");
    assert.notStrictEqual(data.queue[0].guest.guest_token, "secret_token_never_expose_alice");
  } finally {
    db.getActiveEventWithQueue = origGetActiveEventWithQueue;
  }
});
