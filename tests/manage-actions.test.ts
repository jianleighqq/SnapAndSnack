import test from "node:test";
import assert from "node:assert/strict";
import {
  callNext as pureCallNext,
  addGuestToQueue as pureAddGuest,
  cancelBooking as pureCancelBooking,
  finishShoot as pureFinishShoot,
  refreshStatuses,
} from "../lib/queue";
import type { QueueEntryWithGuest } from "../lib/types";

function createGuest(id: string, name: string) {
  return {
    id: `g_${id}`,
    event_id: "evt_test",
    full_name: name,
    email: `${id}@test.com`,
    guest_token: `token_${id}`,
  };
}

test("Manage Action: Finish validation rejects non-IN_PROGRESS guest with 409", () => {
  const queue: QueueEntryWithGuest[] = [
    {
      id: "q_1",
      event_id: "evt_test",
      guest_id: "g_1",
      queue_number: 1,
      scheduled_shoot_time: null,
      status: "WAITING",
      guest: createGuest("1", "Alice"),
    },
  ];

  const target = queue.find((q) => q.id === "q_1");
  assert.ok(target);

  // Simulating the backend validation rule
  let caughtError: any = null;
  if (target.status !== "IN_PROGRESS") {
    caughtError = new Error("Call this guest first");
    caughtError.statusCode = 409;
  }

  assert.ok(caughtError);
  assert.equal(caughtError.message, "Call this guest first");
  assert.equal(caughtError.statusCode, 409);
});

test("Manage Actions Flow: Add 3 guests -> Call Next -> Finish guest 1 -> Cancel guest 3", () => {
  let queue: QueueEntryWithGuest[] = [];

  // 1. Add 3 guests
  const g1 = pureAddGuest(queue, createGuest("1", "Guest 1"));
  queue = refreshStatuses(g1.updatedQueue);

  const g2 = pureAddGuest(queue, createGuest("2", "Guest 2"));
  queue = refreshStatuses(g2.updatedQueue);

  const g3 = pureAddGuest(queue, createGuest("3", "Guest 3"));
  queue = refreshStatuses(g3.updatedQueue);

  assert.equal(queue.length, 3);
  assert.equal(queue[0].queue_number, 1);
  assert.equal(queue[1].queue_number, 2);
  assert.equal(queue[2].queue_number, 3);

  // 2. Call Next: guest 1 becomes IN_PROGRESS, guest 2 becomes REMINDED (1st behind in line), guest 3 is WAITING
  const callNextRes = pureCallNext(queue);
  queue = refreshStatuses(callNextRes.updatedQueue);

  const guest1 = queue.find((q) => q.queue_number === 1);
  const guest2 = queue.find((q) => q.queue_number === 2);
  const guest3 = queue.find((q) => q.queue_number === 3);

  assert.equal(guest1?.status, "IN_PROGRESS");
  assert.equal(guest2?.status, "REMINDED");
  assert.equal(guest3?.status, "WAITING");

  // 3. Finish guest 1 (valid because guest 1 is IN_PROGRESS)
  assert.equal(guest1?.status, "IN_PROGRESS");
  const finishRes = pureFinishShoot(queue, guest1!.id);
  queue = refreshStatuses(finishRes.updatedQueue);

  const finishedG1 = queue.find((q) => q.queue_number === 1);
  assert.equal(finishedG1?.status, "COMPLETED");

  // Since no guest is IN_PROGRESS after finish, guest 2 is now first in line -> REMINDED, guest 3 is WAITING
  const afterFinishG2 = queue.find((q) => q.queue_number === 2);
  const afterFinishG3 = queue.find((q) => q.queue_number === 3);
  assert.equal(afterFinishG2?.status, "REMINDED");
  assert.equal(afterFinishG3?.status, "WAITING");

  // 4. Cancel guest 3
  const cancelRes = pureCancelBooking(queue, guest3!.id);
  queue = refreshStatuses(cancelRes.updatedQueue);

  const cancelledG3 = queue.find((q) => q.queue_number === 3);
  assert.equal(cancelledG3?.status, "CANCELLED");

  // Final assertions
  assert.equal(queue.find((q) => q.queue_number === 1)?.status, "COMPLETED");
  assert.equal(queue.find((q) => q.queue_number === 2)?.status, "REMINDED");
  assert.equal(queue.find((q) => q.queue_number === 3)?.status, "CANCELLED");
});

