import type { Guest, QueueEntryWithGuest } from "./types";

/**
 * Pure functions for queue operations.
 *
 * Rules:
 * 1. Queue numbers are unique per event and never reused.
 * 2. Statuses: WAITING, REMINDED, IN_PROGRESS, COMPLETED, CANCELLED.
 * 3. Status rule (recomputed after every queue change: Call Next, cancel, reorder, add guest):
 *    The first guest in line behind the IN_PROGRESS guest is REMINDED.
 *    Every other active guest after that is WAITING.
 *    COMPLETED and CANCELLED guests never change.
 * 4. Call Next completes the current guest and promotes the next waiting guest to IN_PROGRESS.
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
 * Pure function that recomputes queue statuses according to the business rule:
 * - Leaves IN_PROGRESS, COMPLETED, and CANCELLED guests unchanged.
 * - Sets the first remaining active guest (in queue order behind IN_PROGRESS) to REMINDED.
 * - Sets all other active guests to WAITING (including guests who were REMINDED before but are no longer first).
 * - Leaves the queue unchanged if no active waiting guests exist.
 */
export function refreshStatuses(queue: QueueEntryWithGuest[]): QueueEntryWithGuest[] {
  let foundFirstActive = false;

  return queue.map((item) => {
    // Leave IN_PROGRESS, COMPLETED, and CANCELLED guests untouched
    if (
      item.status === "IN_PROGRESS" ||
      item.status === "COMPLETED" ||
      item.status === "CANCELLED"
    ) {
      return item;
    }

    // Active guest in line (WAITING or REMINDED)
    if (!foundFirstActive) {
      foundFirstActive = true;
      if (item.status !== "REMINDED") {
        return {
          ...item,
          status: "REMINDED" as const,
          updated_at: new Date().toISOString(),
        };
      }
      return item;
    } else {
      // All subsequent active guests must be WAITING
      if (item.status !== "WAITING") {
        return {
          ...item,
          status: "WAITING" as const,
          updated_at: new Date().toISOString(),
        };
      }
      return item;
    }
  });
}

/**
 * Adds a new guest to the queue.
 * Queue numbers are strictly monotonic and never reused, even if previous guests cancel.
 * Refreshes statuses so the active line rules are respected.
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

  const refreshedQueue = refreshStatuses([...queue, newEntry]);
  const finalNewEntry = refreshedQueue.find((e) => e.id === newEntry.id) || newEntry;

  return {
    updatedQueue: refreshedQueue,
    newEntry: finalNewEntry,
  };
}

/**
 * Advances the queue:
 * - Sets the current IN_PROGRESS guest to COMPLETED.
 * - Promotes the next waiting or reminded guest in queue order to IN_PROGRESS.
 * - Calls refreshStatuses so the first remaining active guest is REMINDED and all others are WAITING.
 * - If nobody is waiting, does nothing and returns message "No guests waiting".
 */
export function callNext(queue: QueueEntryWithGuest[]): {
  updatedQueue: QueueEntryWithGuest[];
  completedGuest: QueueEntryWithGuest | null;
  promotedGuest: QueueEntryWithGuest | null;
  message?: string;
} {
  // Find first eligible waiting or reminded guest in queue order
  const nextCandidateIndex = queue.findIndex(
    (item) => item.status === "WAITING" || item.status === "REMINDED"
  );

  if (nextCandidateIndex === -1) {
    return {
      updatedQueue: [...queue],
      completedGuest: null,
      promotedGuest: null,
      message: "No guests waiting",
    };
  }

  let completedGuest: QueueEntryWithGuest | null = null;
  let promotedGuest: QueueEntryWithGuest | null = null;

  const intermediateQueue = queue.map((item, index) => {
    if (item.status === "IN_PROGRESS") {
      completedGuest = {
        ...item,
        status: "COMPLETED" as const,
        updated_at: new Date().toISOString(),
      };
      return completedGuest;
    }
    if (index === nextCandidateIndex) {
      promotedGuest = {
        ...item,
        status: "IN_PROGRESS" as const,
        updated_at: new Date().toISOString(),
      };
      return promotedGuest;
    }
    return item;
  });

  const updatedQueue = refreshStatuses(intermediateQueue);

  return {
    updatedQueue,
    completedGuest,
    promotedGuest,
  };
}

/**
 * Cancels a booking.
 * Sets the specified item status to CANCELLED and recomputes REMINDED/WAITING statuses.
 */
export function cancelBooking(
  queue: QueueEntryWithGuest[],
  queueId: string
): {
  updatedQueue: QueueEntryWithGuest[];
  cancelledEntry: QueueEntryWithGuest | null;
} {
  let cancelledEntry: QueueEntryWithGuest | null = null;

  const intermediate = queue.map((item) => {
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

  const updatedQueue = refreshStatuses(intermediate);

  return { updatedQueue, cancelledEntry };
}

/**
 * Manually starts a shoot for a specific guest:
 * - Marks the chosen guest as IN_PROGRESS.
 * - Any guest currently IN_PROGRESS transitions to COMPLETED.
 * - Refreshes statuses for the remaining active line.
 */
export function startShoot(
  queue: QueueEntryWithGuest[],
  queueId: string
): {
  updatedQueue: QueueEntryWithGuest[];
  startedEntry: QueueEntryWithGuest | null;
} {
  let startedEntry: QueueEntryWithGuest | null = null;

  const intermediate = queue.map((item) => {
    if (item.id === queueId) {
      startedEntry = {
        ...item,
        status: "IN_PROGRESS" as const,
        updated_at: new Date().toISOString(),
      };
      return startedEntry;
    }
    if (item.status === "IN_PROGRESS") {
      return {
        ...item,
        status: "COMPLETED" as const,
        updated_at: new Date().toISOString(),
      };
    }
    return item;
  });

  const updatedQueue = refreshStatuses(intermediate);

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

  const intermediate = queue.map((item) => {
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

  const updatedQueue = refreshStatuses(intermediate);

  return { updatedQueue, finishedEntry };
}

/**
 * Reorders the waiting members of the queue based on an ordered array of IDs.
 * Non-waiting members (IN_PROGRESS, COMPLETED, CANCELLED) keep their positions.
 * Refreshes statuses so the new 1st waiting guest is REMINDED and the previous one becomes WAITING.
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

  for (const item of Array.from(waitingMap.values())) {
    reorderedWaiting.push(item);
  }

  let waitingIdx = 0;
  const intermediate = queue.map((item) => {
    if (item.status === "WAITING" || item.status === "REMINDED") {
      const nextItem = reorderedWaiting[waitingIdx];
      waitingIdx++;
      return nextItem;
    }
    return item;
  });

  return refreshStatuses(intermediate);
}

/**
 * Backwards compatibility alias for refreshStatuses.
 */
export function applyGetReadyReminders(
  queue: QueueEntryWithGuest[]
): QueueEntryWithGuest[] {
  return refreshStatuses(queue);
}
