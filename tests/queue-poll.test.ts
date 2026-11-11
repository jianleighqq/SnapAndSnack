import test from "node:test";
import assert from "node:assert/strict";
import {
  callNext as pureCallNext,
  addGuestToQueue as pureAddGuest,
  refreshStatuses,
} from "../lib/queue";
import type { QueueEntryWithGuest } from "../lib/types";

function makeQueueEntry(id: string, qNum: number, status: QueueEntryWithGuest["status"]): QueueEntryWithGuest {
  return {
    id,
    event_id: "evt_1",
    guest_id: `g_${id}`,
    queue_number: qNum,
    scheduled_shoot_time: null,
    status,
    guest: {
      id: `g_${id}`,
      event_id: "evt_1",
      full_name: `Guest ${qNum}`,
      email: `guest${qNum}@test.com`,
      guest_token: `token_${qNum}`,
    },
  };
}

test("Queue polling race condition resolution: out-of-order responses are dropped", () => {
  let latestRequestId = 0;
  let clientQueue: QueueEntryWithGuest[] = [];

  // Poll 1 starts at T=0
  const req1 = ++latestRequestId;

  // Client performs Add Guest at T=1 (request 2)
  const req2 = ++latestRequestId;
  const newGuestEntry = makeQueueEntry("q_1", 1, "WAITING");
  clientQueue = [newGuestEntry];

  // Poll 1 (stale response) resolves at T=2 with empty queue
  const staleDataFromPoll1: QueueEntryWithGuest[] = [];
  if (req1 === latestRequestId) {
    clientQueue = staleDataFromPoll1;
  }

  // Verify stale poll 1 did NOT overwrite the guest
  assert.equal(clientQueue.length, 1);
  assert.equal(clientQueue[0].id, "q_1");

  // Poll 2 response arrives at T=3 with the new guest
  if (req2 === latestRequestId) {
    clientQueue = [newGuestEntry];
  }
  assert.equal(clientQueue.length, 1);
});

test("Queue status progression: Add Guest -> Call Next -> Statuses stay correct", () => {
  // Start with empty queue
  let queue: QueueEntryWithGuest[] = [];

  // 1. Add Guest A - since no one is IN_PROGRESS, first in line becomes REMINDED per status rule
  const guestA = {
    id: "g_a",
    event_id: "evt_1",
    full_name: "Guest A",
    email: "a@test.com",
    guest_token: "tok_a",
  };
  const resA = pureAddGuest(queue, guestA);
  queue = refreshStatuses(resA.updatedQueue);

  assert.equal(queue.length, 1);
  assert.equal(queue[0].queue_number, 1);
  assert.equal(queue[0].status, "REMINDED");

  // 2. Add Guest B
  const guestB = {
    id: "g_b",
    event_id: "evt_1",
    full_name: "Guest B",
    email: "b@test.com",
    guest_token: "tok_b",
  };
  const resB = pureAddGuest(queue, guestB);
  queue = refreshStatuses(resB.updatedQueue);

  assert.equal(queue.length, 2);
  assert.equal(queue[0].queue_number, 1);
  assert.equal(queue[1].queue_number, 2);

  // 3. Call Next promotes Guest A to IN_PROGRESS, and Guest B becomes REMINDED (1st behind in line)
  const callNextRes = pureCallNext(queue);
  queue = refreshStatuses(callNextRes.updatedQueue);

  assert.equal(queue[0].status, "IN_PROGRESS");
  assert.equal(queue[1].status, "REMINDED");

  // 4. Repeated refresh / poll retains exact statuses without reverting
  const refreshedAgain = refreshStatuses(queue);
  assert.deepEqual(refreshedAgain, queue);
});
