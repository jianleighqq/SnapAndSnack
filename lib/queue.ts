import type { Guest, QueueEntryWithGuest, QueueItem } from "./types";

/**
 * Pure functions for queue operations.
 *
 * Rules:
 * 1. Queue numbers are unique per event and never reused.
 * 2. Statuses: WAITING, REMINDED, IN_PROGRESS, COMPLETED, CANCELLED.
 * 3. Call Next completes the current guest and promotes the next waiting guest to IN_PROGRESS.
 * 4. 5-minute get-ready reminder applies to the 2nd person in line and beyond, not to the immediate next.
 * 5. All functions return fresh immutable arrays/objects.
 */

/**
 * Returns only the active members of the queue (IN_PROGRESS, REMINDED, WAITING)
 * sorted in natural order (IN_PROGRESS first, then by queue_number or priority).
 */
export function getActiveQueue(queue: QueueEntryWithGuest[]): QueueEntryWithGuest[] {
  const inProgress = queue.filter((item) => item.status === "IN_PROGRESS");
  const waitingOrReminded = queue.filter(
    (item) => item.status === "WAITING" || item.status === "REMINDED"
  );
  return [...inProgress, ...waitingOrReminded];
}

/**
 * Adds a new guest to the queue.
 * Queue numbers are strictly monotonic and never reused, even if previous guests cancel.
 */
export function addGuestToQueue(
  queue: QueueEntryWithGuest[],
  guest: Guest,
  scheduledShootTime: string | null = null
): {
  updatedQueue: QueueEntryWithGuest[];
  newEntry: QueueEntryWithGuest;
} {
  const highestQueueNumber = queue.reduce(
    (max, item) => (item.queue_number > max ? item.queue_number : max),
    0
  );
  const nextQueueNumber = highestQueueNumber + 1;

  const newEntry: QueueEntryWithGuest = {
    id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    event_id: guest.event_id,
    guest_id: guest.id,
    queue_number: nextQueueNumber,
    scheduled_shoot_time: scheduledShootTime,
    status: "WAITING",
    guest,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return {
    updatedQueue: [...queue, newEntry],
    newEntry,
  };
}

/**
 * Advances the queue:
 * - Current IN_PROGRESS guest transitions to COMPLETED.
 * - The next waiting or reminded guest transitions to IN_PROGRESS.
 */
export function callNext(queue: QueueEntryWithGuest[]): {
  updatedQueue: QueueEntryWithGuest[];
  completedGuest: QueueEntryWithGuest | null;
  promotedGuest: QueueEntryWithGuest | null;
} {
  let completedGuest: QueueEntryWithGuest | null = null;
  let promotedGuest: QueueEntryWithGuest | null = null;

  // First pass: mark currently IN_PROGRESS guest as COMPLETED
  const afterComplete = queue.map((item) => {
    if (item.status === "IN_PROGRESS") {
      completedGuest = {
        ...item,
        status: "COMPLETED",
        updated_at: new Date().toISOString(),
      };
      return completedGuest;
    }
    return item;
  });

  // Second pass: find the first active waiting or reminded guest
  const nextCandidateIndex = afterComplete.findIndex(
    (item) => item.status === "WAITING" || item.status === "REMINDED"
  );

  const updatedQueue = afterComplete.map((item, index) => {
    if (index === nextCandidateIndex) {
      promotedGuest = {
        ...item,
        status: "IN_PROGRESS",
        updated_at: new Date().toISOString(),
      };
      return promotedGuest;
    }
    return item;
  });

  return {
    updatedQueue,
    completedGuest,
    promotedGuest,
  };
}

/**
 * Cancels a booking.
 * Returns a new queue with the specified item status set to CANCELLED.
 */
export function cancelBooking(
  queue: QueueEntryWithGuest[],
  queueId: string
): {
  updatedQueue: QueueEntryWithGuest[];
  cancelledEntry: QueueEntryWithGuest | null;
} {
  let cancelledEntry: QueueEntryWithGuest | null = null;

  const updatedQueue = queue.map((item) => {
    if (item.id === queueId) {
      cancelledEntry = {
        ...item,
        status: "CANCELLED" as const,
        updated_at: new Date().toISOString(),
      };
      return cancelledEntry;
    }
    return item;
  });

  return { updatedQueue, cancelledEntry };
}

/**
 * Manually starts a shoot for a specific guest:
 * - Marks the chosen guest as IN_PROGRESS.
 * - Any guest currently IN_PROGRESS is transitioned to COMPLETED so only one party shoots at once.
 */
export function startShoot(
  queue: QueueEntryWithGuest[],
  queueId: string
): {
  updatedQueue: QueueEntryWithGuest[];
  startedEntry: QueueEntryWithGuest | null;
} {
  let startedEntry: QueueEntryWithGuest | null = null;

  const updatedQueue = queue.map((item) => {
    if (item.id === queueId) {
      startedEntry = {
        ...item,
        status: "IN_PROGRESS" as const,
        updated_at: new Date().toISOString(),
      };
      return startedEntry;
    }
    // If another guest was shooting, complete their session
    if (item.status === "IN_PROGRESS") {
      return {
        ...item,
        status: "COMPLETED" as const,
        updated_at: new Date().toISOString(),
      };
    }
    return item;
  });

  return { updatedQueue, startedEntry };
}

/**
 * Manually triggers a get-ready reminder for a specific guest.
 */
export function remindGuest(
  queue: QueueEntryWithGuest[],
  queueId: string
): {
  updatedQueue: QueueEntryWithGuest[];
  remindedEntry: QueueEntryWithGuest | null;
} {
  let remindedEntry: QueueEntryWithGuest | null = null;

  const updatedQueue = queue.map((item) => {
    if (item.id === queueId) {
      remindedEntry = {
        ...item,
        status: "REMINDED" as const,
        updated_at: new Date().toISOString(),
      };
      return remindedEntry;
    }
    return item;
  });

  return { updatedQueue, remindedEntry };
}

/**
 * Manually finishes/completes a session for a specific guest.
 */
export function finishShoot(
  queue: QueueEntryWithGuest[],
  queueId: string
): {
  updatedQueue: QueueEntryWithGuest[];
  finishedEntry: QueueEntryWithGuest | null;
} {
  let finishedEntry: QueueEntryWithGuest | null = null;

  const updatedQueue = queue.map((item) => {
    if (item.id === queueId) {
      finishedEntry = {
        ...item,
        status: "COMPLETED" as const,
        updated_at: new Date().toISOString(),
      };
      return finishedEntry;
    }
    return item;
  });

  return { updatedQueue, finishedEntry };
}

/**
 * Reorders the waiting members of the queue based on an ordered array of IDs.
 * Non-waiting members (IN_PROGRESS, COMPLETED, CANCELLED) keep their positions.
 */
export function reorderWaitingQueue(
  queue: QueueEntryWithGuest[],
  orderedWaitingIds: string[]
): QueueEntryWithGuest[] {
  const waitingMap = new Map(
    queue.filter((i) => i.status === "WAITING" || i.status === "REMINDED").map((i) => [i.id, i])
  );

  const reorderedWaiting: QueueEntryWithGuest[] = [];
  for (const id of orderedWaitingIds) {
    const item = waitingMap.get(id);
    if (item) {
      reorderedWaiting.push(item);
      waitingMap.delete(id);
    }
  }

  // Any remaining waiting entries not explicitly in orderedWaitingIds
  for (const item of Array.from(waitingMap.values())) {
    reorderedWaiting.push(item);
  }

  // Reassemble preserving non-waiting slots
  let waitingIdx = 0;
  return queue.map((item) => {
    if (item.status === "WAITING" || item.status === "REMINDED") {
      const nextItem = reorderedWaiting[waitingIdx];
      waitingIdx++;
      return nextItem;
    }
    return item;
  });
}

/**
 * Evaluates who should receive the 5-minute reminder.
 * Business Rule: "The 5-minute get-ready reminder applies to the 2nd client in line and beyond,
 * not to the guest who is immediately next."
 */
export function applyGetReadyReminders(
  queue: QueueEntryWithGuest[]
): QueueEntryWithGuest[] {
  // Filter active waiting/reminded entries in line order
  const waitingEntries = queue.filter(
    (item) => item.status === "WAITING" || item.status === "REMINDED"
  );

  // Position 0 is immediately next (no 5-minute reminder)
  // Position 1 and beyond are the 2nd client in line and beyond
  const reminderEligibleIds = new Set(
    waitingEntries.slice(1).map((item) => item.id)
  );

  return queue.map((item) => {
    if (reminderEligibleIds.has(item.id) && item.status === "WAITING") {
      return {
        ...item,
        status: "REMINDED",
        updated_at: new Date().toISOString(),
      };
    }
    return item;
  });
}
