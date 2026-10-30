import test from "node:test";
import assert from "node:assert/strict";
import {
  callNext,
  cancelBooking,
  addGuestToQueue,
  applyGetReadyReminders,
  reorderWaitingQueue,
  startShoot,
  remindGuest,
  finishShoot,
} from "../lib/queue";
import type { QueueEntryWithGuest } from "../lib/types";

function createMockQueue(): QueueEntryWithGuest[] {
  return [
    {
      id: "q_1",
      event_id: "evt_1",
      guest_id: "g_1",
      queue_number: 1,
      scheduled_shoot_time: null,
      status: "IN_PROGRESS",
      guest: { id: "g_1", event_id: "evt_1", full_name: "Alice", email: "alice@test.com", guest_token: "tok_1" },
    },
    {
      id: "q_2",
      event_id: "evt_1",
      guest_id: "g_2",
      queue_number: 2,
      scheduled_shoot_time: null,
      status: "WAITING",
      guest: { id: "g_2", event_id: "evt_1", full_name: "Bob", email: "bob@test.com", guest_token: "tok_2" },
    },
    {
      id: "q_3",
      event_id: "evt_1",
      guest_id: "g_3",
      queue_number: 3,
      scheduled_shoot_time: null,
      status: "WAITING",
      guest: { id: "g_3", event_id: "evt_1", full_name: "Charlie", email: "charlie@test.com", guest_token: "tok_3" },
    },
  ];
}

test("callNext completes current guest and promotes next waiting guest", () => {
  const queue = createMockQueue();
  const { updatedQueue, completedGuest, promotedGuest } = callNext(queue);

  assert.equal(completedGuest?.id, "q_1");
  assert.equal(completedGuest?.status, "COMPLETED");

  assert.equal(promotedGuest?.id, "q_2");
  assert.equal(promotedGuest?.status, "IN_PROGRESS");

  const completedInList = updatedQueue.find((q) => q.id === "q_1");
  const inProgressInList = updatedQueue.find((q) => q.id === "q_2");
  const waitingInList = updatedQueue.find((q) => q.id === "q_3");

  assert.equal(completedInList?.status, "COMPLETED");
  assert.equal(inProgressInList?.status, "IN_PROGRESS");
  assert.equal(waitingInList?.status, "WAITING");
});

test("addGuestToQueue generates unique monotonically increasing queue number", () => {
  const queue = createMockQueue();
  const newGuest = {
    id: "g_4",
    event_id: "evt_1",
    full_name: "Diana",
    email: "diana@test.com",
    guest_token: "tok_4",
  };

  const { updatedQueue, newEntry } = addGuestToQueue(queue, newGuest);

  assert.equal(newEntry.queue_number, 4);
  assert.equal(newEntry.status, "WAITING");
  assert.equal(updatedQueue.length, 4);
});

test("cancelBooking changes target status to CANCELLED without removing entry", () => {
  const queue = createMockQueue();
  const { updatedQueue, cancelledEntry } = cancelBooking(queue, "q_2");

  assert.equal(cancelledEntry?.status, "CANCELLED");
  const target = updatedQueue.find((q) => q.id === "q_2");
  assert.equal(target?.status, "CANCELLED");
  assert.equal(updatedQueue.length, 3);
});

test("applyGetReadyReminders applies to 2nd client in line and beyond, not immediate next", () => {
  const queue = createMockQueue();
  // In createMockQueue:
  // q_1 is IN_PROGRESS
  // q_2 is immediate next waiting (position 0 in waiting list -> NO reminder)
  // q_3 is 2nd in waiting list (position 1 in waiting list -> GETS reminder)
  const updated = applyGetReadyReminders(queue);

  const q2 = updated.find((q) => q.id === "q_2");
  const q3 = updated.find((q) => q.id === "q_3");

  assert.equal(q2?.status, "WAITING", "Immediate next should remain WAITING");
  assert.equal(q3?.status, "REMINDED", "2nd in line should be marked REMINDED");
});

test("reorderWaitingQueue alters order of waiting guests properly", () => {
  const queue = createMockQueue();
  // Swap order of q_3 and q_2
  const reordered = reorderWaitingQueue(queue, ["q_3", "q_2"]);

  assert.equal(reordered[0].id, "q_1"); // IN_PROGRESS unchanged
  assert.equal(reordered[1].id, "q_3"); // Moved up
  assert.equal(reordered[2].id, "q_2"); // Moved down
});

test("startShoot transitions target to IN_PROGRESS and completes existing IN_PROGRESS guest", () => {
  const queue = createMockQueue();
  // q_1 is IN_PROGRESS, q_2 is WAITING
  const { updatedQueue, startedEntry } = startShoot(queue, "q_2");

  assert.equal(startedEntry?.id, "q_2");
  assert.equal(startedEntry?.status, "IN_PROGRESS");

  const q1 = updatedQueue.find((q) => q.id === "q_1");
  const q2 = updatedQueue.find((q) => q.id === "q_2");
  assert.equal(q1?.status, "COMPLETED", "Previous shooting guest is completed");
  assert.equal(q2?.status, "IN_PROGRESS");
});

test("remindGuest marks specific guest as REMINDED", () => {
  const queue = createMockQueue();
  const { updatedQueue, remindedEntry } = remindGuest(queue, "q_2");

  assert.equal(remindedEntry?.id, "q_2");
  assert.equal(remindedEntry?.status, "REMINDED");

  const q2 = updatedQueue.find((q) => q.id === "q_2");
  assert.equal(q2?.status, "REMINDED");
});

test("finishShoot marks specific guest as COMPLETED", () => {
  const queue = createMockQueue();
  const { updatedQueue, finishedEntry } = finishShoot(queue, "q_1");

  assert.equal(finishedEntry?.id, "q_1");
  assert.equal(finishedEntry?.status, "COMPLETED");

  const q1 = updatedQueue.find((q) => q.id === "q_1");
  assert.equal(q1?.status, "COMPLETED");
});
