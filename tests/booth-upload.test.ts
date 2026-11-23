import { test } from "node:test";
import assert from "node:assert";

/**
 * Unit tests verifying:
 * 1. media_assets payload adheres strictly to schema (no event_id, guest_id, public_url).
 * 2. pose_id sanitization (must be a valid UUID or null to prevent Postgres type errors).
 * 3. Idempotent record matching (prevents duplicate rows on Retry Save).
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizePoseId(poseId?: string | null): string | null {
  return poseId && UUID_REGEX.test(poseId) ? poseId : null;
}

const ALLOWED_MEDIA_ASSETS_COLUMNS = new Set([
  "id",
  "session_id",
  "pose_id",
  "media_type",
  "shot_number",
  "retake_count",
  "storage_path",
  "in_gallery",
  "created_at",
]);

function validateMediaAssetPayload(payload: Record<string, any>): { valid: boolean; invalidKeys: string[] } {
  const invalidKeys = Object.keys(payload).filter((key) => !ALLOWED_MEDIA_ASSETS_COLUMNS.has(key));
  return {
    valid: invalidKeys.length === 0,
    invalidKeys,
  };
}

test("media_assets payload validation rejects invalid columns (event_id, guest_id, public_url)", () => {
  const oldBadPayload = {
    event_id: "event-123",
    guest_id: "guest-456",
    session_id: "session-789",
    storage_path: "event-123/guest-456/shot-1.jpg",
    public_url: "https://example.com/shot-1.jpg",
    media_type: "PHOTO",
    shot_number: 1,
    retake_count: 0,
    pose_id: null,
    in_gallery: false,
  };

  const oldValidation = validateMediaAssetPayload(oldBadPayload);
  assert.strictEqual(oldValidation.valid, false);
  assert.deepStrictEqual(oldValidation.invalidKeys.sort(), ["event_id", "guest_id", "public_url"].sort());

  const newValidPhotoPayload = {
    session_id: "session-789",
    storage_path: "event-123/guest-456/shot-1.jpg",
    media_type: "PHOTO",
    shot_number: 1,
    retake_count: 0,
    pose_id: null,
    in_gallery: false,
  };

  const newPhotoValidation = validateMediaAssetPayload(newValidPhotoPayload);
  assert.strictEqual(newPhotoValidation.valid, true);
  assert.strictEqual(newPhotoValidation.invalidKeys.length, 0);

  const newValidStripPayload = {
    session_id: "session-789",
    storage_path: "event-123/guest-456/strip.jpg",
    media_type: "STRIP",
    in_gallery: false,
  };

  const newStripValidation = validateMediaAssetPayload(newValidStripPayload);
  assert.strictEqual(newStripValidation.valid, true);
  assert.strictEqual(newStripValidation.invalidKeys.length, 0);

  const newValidGifPayload = {
    session_id: "session-789",
    storage_path: "event-123/guest-456/animation.gif",
    media_type: "GIF",
    in_gallery: false,
  };

  const newGifValidation = validateMediaAssetPayload(newValidGifPayload);
  assert.strictEqual(newGifValidation.valid, true);
  assert.strictEqual(newGifValidation.invalidKeys.length, 0);
});

test("sanitizePoseId accepts valid UUID and rejects mock strings / non-UUIDs", () => {
  const validUuid = "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d";
  assert.strictEqual(sanitizePoseId(validUuid), validUuid);

  // Mock / invalid string inputs should resolve to null
  assert.strictEqual(sanitizePoseId("pose-1"), null);
  assert.strictEqual(sanitizePoseId("couple"), null);
  assert.strictEqual(sanitizePoseId(""), null);
  assert.strictEqual(sanitizePoseId(null), null);
  assert.strictEqual(sanitizePoseId(undefined), null);
});

test("Idempotent update logic prevents duplicate rows on Retry Save", () => {
  // Simulate mock database table state
  const mockTable: Array<{
    id: string;
    session_id: string;
    media_type: string;
    shot_number?: number | null;
    retake_count?: number;
    pose_id?: string | null;
    storage_path: string;
  }> = [];

  function upsertPhoto(session_id: string, shot_number: number, storage_path: string, retake_count: number) {
    const existingIndex = mockTable.findIndex(
      (row) => row.session_id === session_id && row.media_type === "PHOTO" && row.shot_number === shot_number
    );
    if (existingIndex >= 0) {
      mockTable[existingIndex].storage_path = storage_path;
      mockTable[existingIndex].retake_count = retake_count;
      return { action: "updated", id: mockTable[existingIndex].id };
    } else {
      const id = `asset-${mockTable.length + 1}`;
      mockTable.push({ id, session_id, media_type: "PHOTO", shot_number, retake_count, storage_path, pose_id: null });
      return { action: "inserted", id };
    }
  }

  function upsertStrip(session_id: string, storage_path: string) {
    const existingIndex = mockTable.findIndex(
      (row) => row.session_id === session_id && row.media_type === "STRIP"
    );
    if (existingIndex >= 0) {
      mockTable[existingIndex].storage_path = storage_path;
      return { action: "updated", id: mockTable[existingIndex].id };
    } else {
      const id = `asset-${mockTable.length + 1}`;
      mockTable.push({ id, session_id, media_type: "STRIP", shot_number: null, retake_count: 0, storage_path, pose_id: null });
      return { action: "inserted", id };
    }
  }

  // 1. Initial shoot of 3 photos and 1 strip
  const p1 = upsertPhoto("session-abc", 1, "path/shot-1.jpg", 0);
  const p2 = upsertPhoto("session-abc", 2, "path/shot-2.jpg", 0);
  const p3 = upsertPhoto("session-abc", 3, "path/shot-3.jpg", 0);
  const strip = upsertStrip("session-abc", "path/strip.jpg");

  assert.strictEqual(p1.action, "inserted");
  assert.strictEqual(p2.action, "inserted");
  assert.strictEqual(p3.action, "inserted");
  assert.strictEqual(strip.action, "inserted");
  assert.strictEqual(mockTable.length, 4);

  // 2. User taps "Retry Save" - must update existing records rather than insert new rows
  const retry1 = upsertPhoto("session-abc", 1, "path/shot-1-retry.jpg", 0);
  const retry2 = upsertPhoto("session-abc", 2, "path/shot-2-retry.jpg", 0);
  const retry3 = upsertPhoto("session-abc", 3, "path/shot-3-retry.jpg", 0);
  const retryStrip = upsertStrip("session-abc", "path/strip-retry.jpg");

  assert.strictEqual(retry1.action, "updated");
  assert.strictEqual(retry2.action, "updated");
  assert.strictEqual(retry3.action, "updated");
  assert.strictEqual(retryStrip.action, "updated");

  // Total rows must still be exactly 4 (3 photos + 1 strip)
  assert.strictEqual(mockTable.length, 4);
  assert.strictEqual(mockTable[0].storage_path, "path/shot-1-retry.jpg");
  assert.strictEqual(mockTable[3].storage_path, "path/strip-retry.jpg");
});

test("Session authorization rule: authorizes IN_PROGRESS and recently completed within 15m grace window", () => {
  const SESSION_GRACE_WINDOW_MS = 15 * 60 * 1000;
  const activeEventId = "active-event-1";

  function evaluateSessionAuth(params: {
    sessionId?: string | null;
    session?: { id: string; event_id: string; ended_at?: string | null; started_at?: string } | null;
    queueEntry?: { status: string } | null;
    nowMs: number;
  }): { authorized: boolean; code?: string } {
    const { sessionId, session, queueEntry, nowMs } = params;
    if (!sessionId || !UUID_REGEX.test(sessionId)) {
      return { authorized: false, code: "INVALID_SESSION_ID" };
    }
    if (!session) {
      return { authorized: false, code: "SESSION_NOT_FOUND" };
    }
    if (session.event_id !== activeEventId) {
      return { authorized: false, code: "EVENT_MISMATCH" };
    }
    if (!queueEntry) {
      return { authorized: false, code: "QUEUE_ENTRY_NOT_FOUND" };
    }

    if (queueEntry.status === "IN_PROGRESS") {
      return { authorized: true };
    }

    let endedAtTime: number | null = null;
    if (session.ended_at) {
      endedAtTime = new Date(session.ended_at).getTime();
    } else if (queueEntry.status === "COMPLETED" && session.started_at) {
      endedAtTime = new Date(session.started_at).getTime();
    }

    if (endedAtTime !== null && !isNaN(endedAtTime)) {
      const elapsedMs = nowMs - endedAtTime;
      const withinGrace = elapsedMs <= SESSION_GRACE_WINDOW_MS && elapsedMs >= -60_000;
      if (withinGrace) {
        return { authorized: true };
      }
      return { authorized: false, code: "SESSION_EXPIRED" };
    }

    return { authorized: false, code: "SESSION_INACTIVE" };
  }

  const now = 1700000000000;
  const validSessionId = "11111111-2222-3333-4444-555555555555";

  // 1. Rejects invalid session ID
  assert.deepStrictEqual(evaluateSessionAuth({ sessionId: "bad-id", nowMs: now }), {
    authorized: false,
    code: "INVALID_SESSION_ID",
  });

  // 2. Rejects session from another event
  assert.deepStrictEqual(
    evaluateSessionAuth({
      sessionId: validSessionId,
      session: { id: validSessionId, event_id: "other-event", ended_at: null },
      queueEntry: { status: "IN_PROGRESS" },
      nowMs: now,
    }),
    { authorized: false, code: "EVENT_MISMATCH" }
  );

  // 3. Accepts active IN_PROGRESS guest
  assert.deepStrictEqual(
    evaluateSessionAuth({
      sessionId: validSessionId,
      session: { id: validSessionId, event_id: activeEventId, ended_at: null },
      queueEntry: { status: "IN_PROGRESS" },
      nowMs: now,
    }),
    { authorized: true }
  );

  // 4. Accepts completed guest 2 minutes after session ended (within 15m window)
  assert.deepStrictEqual(
    evaluateSessionAuth({
      sessionId: validSessionId,
      session: {
        id: validSessionId,
        event_id: activeEventId,
        ended_at: new Date(now - 2 * 60 * 1000).toISOString(),
      },
      queueEntry: { status: "COMPLETED" },
      nowMs: now,
    }),
    { authorized: true }
  );

  // 5. Accepts completed guest 14.5 minutes after session ended (within 15m window)
  assert.deepStrictEqual(
    evaluateSessionAuth({
      sessionId: validSessionId,
      session: {
        id: validSessionId,
        event_id: activeEventId,
        ended_at: new Date(now - 14.5 * 60 * 1000).toISOString(),
      },
      queueEntry: { status: "COMPLETED" },
      nowMs: now,
    }),
    { authorized: true }
  );

  // 6. Rejects completed guest 16 minutes after session ended (outside 15m window)
  assert.deepStrictEqual(
    evaluateSessionAuth({
      sessionId: validSessionId,
      session: {
        id: validSessionId,
        event_id: activeEventId,
        ended_at: new Date(now - 16 * 60 * 1000).toISOString(),
      },
      queueEntry: { status: "COMPLETED" },
      nowMs: now,
    }),
    { authorized: false, code: "SESSION_EXPIRED" }
  );

  // 7. Rejects cancelled guest
  assert.deepStrictEqual(
    evaluateSessionAuth({
      sessionId: validSessionId,
      session: { id: validSessionId, event_id: activeEventId, ended_at: null },
      queueEntry: { status: "CANCELLED" },
      nowMs: now,
    }),
    { authorized: false, code: "SESSION_INACTIVE" }
  );
});
