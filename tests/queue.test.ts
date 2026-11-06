import test from "node:test";
import assert from "node:assert/strict";
import {
  callNext,
  cancelBooking,
  addGuestToQueue,
  reorderWaitingQueue,
  startShoot,
  remindGuest,
  finishShoot,
  refreshStatuses,
} from "../lib/queue";
import type { QueueEntryWithGuest } from "../lib/types";

function create5GuestQueue(): QueueEntryWithGuest[] {
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
      status: "REMINDED",
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
    {
      id: "q_4",
      event_id: "evt_1",
      guest_id: "g_4",
      queue_number: 4,
      scheduled_shoot_time: null,
      status: "WAITING",
      guest: { id: "g_4", event_id: "evt_1", full_name: "Diana", email: "diana@test.com", guest_token: "tok_4" },
    },
    {
      id: "q_5",
      event_id: "evt_1",
      guest_id: "g_5",
      queue_number: 5,
      scheduled_shoot_time: null,
      status: "WAITING",
      guest: { id: "g_5", event_id: "evt_1", full_name: "Evan", email: "evan@test.com", guest_token: "tok_5" },
    },
  ];
}

test("refreshStatuses pure function leaves IN_PROGRESS/COMPLETED/CANCELLED untouched and sets first active to REMINDED", () => {
  const queue: QueueEntryWithGuest[] = [
    {
      id: "q_done",
      event_id: "evt_1",
      guest_id: "g_0",
      queue_number: 0,
      scheduled_shoot_time: null,
      status: "COMPLETED",
      guest: { id: "g_0", event_id: "evt_1", full_name: "Done Guest", email: "done@test.com", guest_token: "tok_0" },
    },
    {
      id: "q_prog",
      event_id: "evt_1",
      guest_id: "g_1",
      queue_number: 1,
      scheduled_shoot_time: null,
      status: "IN_PROGRESS",
      guest: { id: "g_1", event_id: "evt_1", full_name: "Shooting", email: "shoot@test.com", guest_token: "tok_1" },
    },
    {
      id: "q_can",
      event_id: "evt_1",
      guest_id: "g_2",
      queue_number: 2,
      scheduled_shoot_time: null,
      status: "CANCELLED",
      guest: { id: "g_2", event_id: "evt_1", full_name: "Cancelled", email: "can@test.com", guest_token: "tok_2" },
    },
    {
      id: "q_first_active",
      event_id: "evt_1",
      guest_id: "g_3",
      queue_number: 3,
      scheduled_shoot_time: null,
      status: "WAITING",
      guest: { id: "g_3", event_id: "evt_1", full_name: "Charlie", email: "c@test.com", guest_token: "tok_3" },
    },
    {
      id: "q_second_active",
      event_id: "evt_1",
      guest_id: "g_4",
      queue_number: 4,
      scheduled_shoot_time: null,
      status: "REMINDED", // Stale reminded status
      guest: { id: "g_4", event_id: "evt_1", full_name: "Diana", email: "d@test.com", guest_token: "tok_4" },
    },
  ];

  const refreshed = refreshStatuses(queue);

  assert.equal(refreshed[0].status, "COMPLETED");
  assert.equal(refreshed[1].status, "IN_PROGRESS");
  assert.equal(refreshed[2].status, "CANCELLED");
  assert.equal(refreshed[3].status, "REMINDED", "First active guest behind IN_PROGRESS must be REMINDED");
  assert.equal(refreshed[4].status, "WAITING", "Subsequent active guest must become WAITING even if previously REMINDED");
});

test("Scenario 1: 5 guests and Call Next once", () => {
  const queue = create5GuestQueue();
  const { updatedQueue, completedGuest, promotedGuest } = callNext(queue);

  assert.equal(completedGuest?.id, "q_1");
  assert.equal(completedGuest?.status, "COMPLETED");

  assert.equal(promotedGuest?.id, "q_2");
  assert.equal(promotedGuest?.status, "IN_PROGRESS");

  const q1 = updatedQueue.find((q) => q.id === "q_1");
  const q2 = updatedQueue.find((q) => q.id === "q_2");
  const q3 = updatedQueue.find((q) => q.id === "q_3");
  const q4 = updatedQueue.find((q) => q.id === "q_4");
  const q5 = updatedQueue.find((q) => q.id === "q_5");

  assert.equal(q1?.status, "COMPLETED");
  assert.equal(q2?.status, "IN_PROGRESS");
  assert.equal(q3?.status, "REMINDED", "Guest 3 is first in line behind IN_PROGRESS, so status must be REMINDED");
  assert.equal(q4?.status, "WAITING", "Guest 4 must stay WAITING");
  assert.equal(q5?.status, "WAITING", "Guest 5 must stay WAITING");
});

test("Scenario 2: Call Next with only one guest waiting", () => {
  const queue: QueueEntryWithGuest[] = [
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
      status: "REMINDED",
      guest: { id: "g_2", event_id: "evt_1", full_name: "Bob", email: "bob@test.com", guest_token: "tok_2" },
    },
  ];

  const { updatedQueue, completedGuest, promotedGuest } = callNext(queue);

  assert.equal(completedGuest?.id, "q_1");
  assert.equal(completedGuest?.status, "COMPLETED");
  assert.equal(promotedGuest?.id, "q_2");
  assert.equal(promotedGuest?.status, "IN_PROGRESS");

  const remainingWaitingOrReminded = updatedQueue.filter(
    (q) => q.status === "WAITING" || q.status === "REMINDED"
  );
  assert.equal(remainingWaitingOrReminded.length, 0, "No guests should remain waiting");

  // Calling Call Next again when no guests are waiting should do nothing and report message
  const nextCallResult = callNext(updatedQueue);
  assert.equal(nextCallResult.message, "No guests waiting");
  assert.equal(nextCallResult.completedGuest, null);
  assert.equal(nextCallResult.promotedGuest, null);
  assert.deepEqual(nextCallResult.updatedQueue, updatedQueue);
});

test("Scenario 3: cancel the REMINDED guest (the next guest becomes REMINDED)", () => {
  const queue = create5GuestQueue(); // q_2 is REMINDED, q_3 is WAITING, q_4 is WAITING, q_5 is WAITING
  const { updatedQueue, cancelledEntry } = cancelBooking(queue, "q_2");

  assert.equal(cancelledEntry?.id, "q_2");
  assert.equal(cancelledEntry?.status, "CANCELLED");

  const q2 = updatedQueue.find((q) => q.id === "q_2");
  const q3 = updatedQueue.find((q) => q.id === "q_3");
  const q4 = updatedQueue.find((q) => q.id === "q_4");
  const q5 = updatedQueue.find((q) => q.id === "q_5");

  assert.equal(q2?.status, "CANCELLED");
  assert.equal(q3?.status, "REMINDED", "Next active guest q_3 must now be REMINDED");
  assert.equal(q4?.status, "WAITING");
  assert.equal(q5?.status, "WAITING");
});

test("Scenario 4: move a guest up or down (reorder)", () => {
  const queue = create5GuestQueue(); // q_1: IN_PROGRESS, q_2: REMINDED, q_3: WAITING, q_4: WAITING, q_5: WAITING

  // Move q_4 to the very front of the waiting line: ["q_4", "q_2", "q_3", "q_5"]
  const reordered = reorderWaitingQueue(queue, ["q_4", "q_2", "q_3", "q_5"]);

  const q1 = reordered.find((q) => q.id === "q_1");
  const q4 = reordered.find((q) => q.id === "q_4");
  const q2 = reordered.find((q) => q.id === "q_2");
  const q3 = reordered.find((q) => q.id === "q_3");
  const q5 = reordered.find((q) => q.id === "q_5");

  assert.equal(q1?.status, "IN_PROGRESS", "IN_PROGRESS guest unchanged");
  assert.equal(q4?.status, "REMINDED", "q_4 moved to top of waiting line, so must be REMINDED");
  assert.equal(q2?.status, "WAITING", "q_2 was REMINDED previously, but is no longer first so must be WAITING");
  assert.equal(q3?.status, "WAITING");
  assert.equal(q5?.status, "WAITING");
});

test("Scenario 5: add a walk-in guest", () => {
  // Case A: Queue has an IN_PROGRESS guest and an already REMINDED waiting guest
  const queueWithReminded = create5GuestQueue().slice(0, 2); // q_1: IN_PROGRESS, q_2: REMINDED
  const walkInGuestA = {
    id: "g_new_a",
    event_id: "evt_1",
    full_name: "Walkin A",
    email: "walkin_a@test.com",
    guest_token: "tok_walkin_a",
  };

  const resultA = addGuestToQueue(queueWithReminded, walkInGuestA);
  const q2 = resultA.updatedQueue.find((q) => q.id === "q_2");
  const newA = resultA.updatedQueue.find((q) => q.id === resultA.newEntry.id);

  assert.equal(q2?.status, "REMINDED", "Existing first waiting guest remains REMINDED");
  assert.equal(newA?.status, "WAITING", "Newly added walk-in behind REMINDED guest must be WAITING");

  // Case B: Queue has an IN_PROGRESS guest but NO waiting guests
  const queueOnlyInProgress = create5GuestQueue().slice(0, 1); // q_1: IN_PROGRESS only
  const walkInGuestB = {
    id: "g_new_b",
    event_id: "evt_1",
    full_name: "Walkin B",
    email: "walkin_b@test.com",
    guest_token: "tok_walkin_b",
  };

  const resultB = addGuestToQueue(queueOnlyInProgress, walkInGuestB);
  const newB = resultB.updatedQueue.find((q) => q.id === resultB.newEntry.id);

  assert.equal(newB?.status, "REMINDED", "Walk-in guest is the first in line behind IN_PROGRESS, so must be REMINDED");
});

test("Scenario 6: empty queue", () => {
  const emptyQueue: QueueEntryWithGuest[] = [];

  const callNextResult = callNext(emptyQueue);
  assert.equal(callNextResult.message, "No guests waiting");
  assert.equal(callNextResult.completedGuest, null);
  assert.equal(callNextResult.promotedGuest, null);
  assert.deepEqual(callNextResult.updatedQueue, []);

  const refreshedEmpty = refreshStatuses(emptyQueue);
  assert.deepEqual(refreshedEmpty, []);
});

test("startShoot transitions target to IN_PROGRESS and completes existing IN_PROGRESS guest", () => {
  const queue = create5GuestQueue();
  const { updatedQueue, startedEntry } = startShoot(queue, "q_2");

  assert.equal(startedEntry?.id, "q_2");
  assert.equal(startedEntry?.status, "IN_PROGRESS");

  const q1 = updatedQueue.find((q) => q.id === "q_1");
  const q2 = updatedQueue.find((q) => q.id === "q_2");
  const q3 = updatedQueue.find((q) => q.id === "q_3");

  assert.equal(q1?.status, "COMPLETED", "Previous shooting guest is completed");
  assert.equal(q2?.status, "IN_PROGRESS");
  assert.equal(q3?.status, "REMINDED", "Next in line becomes REMINDED");
});

test("remindGuest marks specific guest as REMINDED", () => {
  const queue = create5GuestQueue();
  const { updatedQueue, remindedEntry } = remindGuest(queue, "q_3");

  assert.equal(remindedEntry?.id, "q_3");
  assert.equal(remindedEntry?.status, "REMINDED");

  const q3 = updatedQueue.find((q) => q.id === "q_3");
  assert.equal(q3?.status, "REMINDED");
});

test("finishShoot marks specific guest as COMPLETED and refreshes remaining statuses", () => {
  const queue = create5GuestQueue();
  const { updatedQueue, finishedEntry } = finishShoot(queue, "q_1");

  assert.equal(finishedEntry?.id, "q_1");
  assert.equal(finishedEntry?.status, "COMPLETED");

  const q1 = updatedQueue.find((q) => q.id === "q_1");
  const q2 = updatedQueue.find((q) => q.id === "q_2");
  const q3 = updatedQueue.find((q) => q.id === "q_3");

  assert.equal(q1?.status, "COMPLETED");
  assert.equal(q2?.status, "REMINDED", "First active guest is REMINDED");
  assert.equal(q3?.status, "WAITING", "Other active guests are WAITING");
});
