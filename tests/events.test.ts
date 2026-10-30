import test from "node:test";
import assert from "node:assert/strict";
import {
  validateEventInput,
  generateEventCode,
  setActiveEventPure,
  closeEventPure,
  deleteEventPure,
} from "../lib/events";
import type { Event } from "../lib/types";

function createMockEvents(): Event[] {
  return [
    {
      id: "evt_1",
      name: "Graduation Party",
      event_type: "Graduation",
      event_code: "GRAD26",
      start_time: "2026-11-01T18:00:00Z",
      end_time: "2026-11-01T22:00:00Z",
      avg_shoot_minutes: 5,
      status: "ACTIVE",
    },
    {
      id: "evt_2",
      name: "Corporate Gala",
      event_type: "Corporate",
      event_code: "CORP26",
      start_time: "2026-11-10T19:00:00Z",
      end_time: "2026-11-10T23:00:00Z",
      avg_shoot_minutes: 5,
      status: "SCHEDULED",
    },
    {
      id: "evt_3",
      name: "Past Birthday",
      event_type: "Birthday",
      event_code: "BDAY26",
      start_time: "2026-10-01T14:00:00Z",
      end_time: "2026-10-01T18:00:00Z",
      avg_shoot_minutes: 4,
      status: "CLOSED",
    },
  ];
}

test("setActiveEventPure enforces that only ONE event can be ACTIVE", () => {
  const events = createMockEvents();

  // Initially evt_1 is ACTIVE, evt_2 is SCHEDULED
  const updated = setActiveEventPure(events, "evt_2");

  const evt1 = updated.find((e) => e.id === "evt_1");
  const evt2 = updated.find((e) => e.id === "evt_2");
  const evt3 = updated.find((e) => e.id === "evt_3");

  assert.equal(evt2?.status, "ACTIVE", "Target event evt_2 should now be ACTIVE");
  assert.equal(evt1?.status, "SCHEDULED", "Previous active event evt_1 should return to SCHEDULED");
  assert.equal(evt3?.status, "CLOSED", "CLOSED events should remain unaffected");

  const activeCount = updated.filter((e) => e.status === "ACTIVE").length;
  assert.equal(activeCount, 1, "There must strictly be exactly one ACTIVE event");
});

test("closeEventPure transitions status to CLOSED", () => {
  const events = createMockEvents();
  const updated = closeEventPure(events, "evt_1");

  const evt1 = updated.find((e) => e.id === "evt_1");
  assert.equal(evt1?.status, "CLOSED");
});

test("deleteEventPure removes target event from array", () => {
  const events = createMockEvents();
  const updated = deleteEventPure(events, "evt_2");

  assert.equal(updated.length, 2);
  assert.equal(updated.some((e) => e.id === "evt_2"), false);
});

test("validateEventInput checks required fields and end time after start time", () => {
  // Empty input
  const emptyRes = validateEventInput({});
  assert.equal(emptyRes.isValid, false);
  assert.ok(emptyRes.errors.name);
  assert.ok(emptyRes.errors.event_type);
  assert.ok(emptyRes.errors.event_code);
  assert.ok(emptyRes.errors.start_time);
  assert.ok(emptyRes.errors.end_time);

  // End time before start time
  const badTimeRes = validateEventInput({
    name: "Winter Bash",
    event_type: "Corporate",
    event_code: "WINT26",
    start_time: "2026-12-01T20:00:00Z",
    end_time: "2026-12-01T18:00:00Z",
    avg_shoot_minutes: 5,
  });
  assert.equal(badTimeRes.isValid, false);
  assert.equal(badTimeRes.errors.end_time, "End time must be after start time");

  // Valid input
  const validRes = validateEventInput({
    name: "Winter Bash",
    event_type: "Corporate",
    event_code: "WINT26",
    start_time: "2026-12-01T18:00:00Z",
    end_time: "2026-12-01T22:00:00Z",
    avg_shoot_minutes: 5,
  });
  assert.equal(validRes.isValid, true);
  assert.equal(Object.keys(validRes.errors).length, 0);
});

test("generateEventCode creates clean uppercase alphanumeric codes", () => {
  const code = generateEventCode("Sam's 30th Birthday", "2026-11-05");
  assert.equal(code, "SAMS26");

  const fallbackCode = generateEventCode("A", "2027-01-01");
  assert.equal(fallbackCode, "AXXX27");
});
