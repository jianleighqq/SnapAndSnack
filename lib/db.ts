import type { Event, Guest, QueueEntryWithGuest } from "./types";
import { mockEvents, mockEvent, mockGuests, mockQueue } from "../mocks/seed-data";
import {
  callNext as pureCallNext,
  cancelBooking as pureCancelBooking,
  addGuestToQueue as pureAddGuest,
  applyGetReadyReminders as pureApplyReminders,
  startShoot as pureStartShoot,
  remindGuest as pureRemindGuest,
  finishShoot as pureFinishShoot,
} from "./queue";
import {
  setActiveEventPure,
  closeEventPure,
  deleteEventPure,
} from "./events";

const STORAGE_KEY_EVENTS = "snap_mock_events";

/**
 * Data Access Layer Interface
 * Allows swapping between Mock in-memory data and Supabase without changing any UI code.
 */
export interface IDataStore {
  // Event Operations
  getEvents(): Promise<Event[]>;
  getEventById(id: string): Promise<Event | null>;
  getCurrentEvent(): Promise<Event>;
  createEvent(event: Omit<Event, "id">): Promise<Event>;
  updateEvent(id: string, updates: Partial<Event>): Promise<Event>;
  setActiveEvent(id: string): Promise<Event[]>;
  closeEvent(id: string): Promise<Event[]>;
  deleteEvent(id: string): Promise<Event[]>;
  hasActiveQueueForEvent(eventId: string): Promise<boolean>;

  // Queue Operations
  getQueue(): Promise<QueueEntryWithGuest[]>;
  callNext(): Promise<{
    completed: QueueEntryWithGuest | null;
    promoted: QueueEntryWithGuest | null;
    queue: QueueEntryWithGuest[];
  }>;
  startShoot(queueId: string): Promise<{
    started: QueueEntryWithGuest | null;
    queue: QueueEntryWithGuest[];
  }>;
  remindGuest(queueId: string): Promise<{
    reminded: QueueEntryWithGuest | null;
    queue: QueueEntryWithGuest[];
  }>;
  finishShoot(queueId: string): Promise<{
    finished: QueueEntryWithGuest | null;
    queue: QueueEntryWithGuest[];
  }>;
  cancelBooking(queueId: string): Promise<{
    cancelled: QueueEntryWithGuest | null;
    queue: QueueEntryWithGuest[];
  }>;
  addGuest(params: {
    fullName: string;
    email: string;
  }): Promise<{
    guest: Guest;
    queueEntry: QueueEntryWithGuest;
  }>;
  getGuestByToken(token: string): Promise<{
    guest: Guest;
    queueEntry: QueueEntryWithGuest | null;
    positionInLine: number | null;
  } | null>;
}

class MockDataStore implements IDataStore {
  private events: Event[] = [...mockEvents];
  private guests: Guest[] = [...mockGuests];
  private queue: QueueEntryWithGuest[] = [...mockQueue];

  constructor() {
    this.hydrateFromStorage();
  }

  private hydrateFromStorage(): void {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_EVENTS);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.events = parsed;
          }
        }
      } catch (err) {
        console.warn("Failed to load events from localStorage:", err);
      }
    }
  }

  private persistEvents(): void {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(this.events));
      } catch (err) {
        console.warn("Failed to persist events to localStorage:", err);
      }
    }
  }

  // --- Event Operations ---

  async getEvents(): Promise<Event[]> {
    this.hydrateFromStorage();
    return [...this.events];
  }

  async getEventById(id: string): Promise<Event | null> {
    this.hydrateFromStorage();
    const event = this.events.find((e) => e.id === id);
    return event ? { ...event } : null;
  }

  async getCurrentEvent(): Promise<Event> {
    this.hydrateFromStorage();
    const active = this.events.find((e) => e.status === "ACTIVE") || this.events[0] || mockEvent;
    return {
      ...active,
      shots_per_guest: active.shots_per_guest || 3,
      max_retakes: active.max_retakes ?? 2,
      print_layout: active.print_layout || "STRIP",
    };
  }

  async createEvent(data: Omit<Event, "id">): Promise<Event> {
    this.hydrateFromStorage();
    const newEvent: Event = {
      ...data,
      shots_per_guest: data.shots_per_guest ?? 3,
      max_retakes: data.max_retakes ?? 2,
      print_layout: data.print_layout ?? "STRIP",
      id: `evt_${Date.now()}`,
      created_at: new Date().toISOString(),
    };

    if (newEvent.status === "ACTIVE") {
      this.events = setActiveEventPure(this.events, newEvent.id);
      this.events.unshift(newEvent);
    } else {
      this.events.push(newEvent);
    }

    this.persistEvents();
    return { ...newEvent };
  }

  async updateEvent(id: string, updates: Partial<Event>): Promise<Event> {
    this.hydrateFromStorage();
    const idx = this.events.findIndex((e) => e.id === id);
    if (idx === -1) {
      throw new Error(`Event ${id} not found`);
    }

    const updated = { ...this.events[idx], ...updates };
    this.events[idx] = updated;

    if (updates.status === "ACTIVE") {
      this.events = setActiveEventPure(this.events, id);
    }

    this.persistEvents();
    return { ...this.events.find((e) => e.id === id)! };
  }

  async setActiveEvent(id: string): Promise<Event[]> {
    this.hydrateFromStorage();
    this.events = setActiveEventPure(this.events, id);
    this.persistEvents();
    return [...this.events];
  }

  async closeEvent(id: string): Promise<Event[]> {
    this.hydrateFromStorage();
    this.events = closeEventPure(this.events, id);
    this.persistEvents();
    return [...this.events];
  }

  async deleteEvent(id: string): Promise<Event[]> {
    this.hydrateFromStorage();
    this.events = deleteEventPure(this.events, id);
    this.persistEvents();
    return [...this.events];
  }

  async hasActiveQueueForEvent(eventId: string): Promise<boolean> {
    return this.queue.some(
      (q) =>
        q.event_id === eventId &&
        (q.status === "WAITING" || q.status === "REMINDED" || q.status === "IN_PROGRESS")
    );
  }

  // --- Queue Operations ---

  async getQueue(): Promise<QueueEntryWithGuest[]> {
    return [...this.queue];
  }

  async callNext(): Promise<{
    completed: QueueEntryWithGuest | null;
    promoted: QueueEntryWithGuest | null;
    queue: QueueEntryWithGuest[];
  }> {
    const result = pureCallNext(this.queue);
    this.queue = pureApplyReminders(result.updatedQueue);
    return {
      completed: result.completedGuest,
      promoted: result.promotedGuest,
      queue: [...this.queue],
    };
  }

  async startShoot(queueId: string): Promise<{
    started: QueueEntryWithGuest | null;
    queue: QueueEntryWithGuest[];
  }> {
    const result = pureStartShoot(this.queue, queueId);
    this.queue = pureApplyReminders(result.updatedQueue);
    return {
      started: result.startedEntry,
      queue: [...this.queue],
    };
  }

  async remindGuest(queueId: string): Promise<{
    reminded: QueueEntryWithGuest | null;
    queue: QueueEntryWithGuest[];
  }> {
    const result = pureRemindGuest(this.queue, queueId);
    this.queue = [...result.updatedQueue];
    return {
      reminded: result.remindedEntry,
      queue: [...this.queue],
    };
  }

  async finishShoot(queueId: string): Promise<{
    finished: QueueEntryWithGuest | null;
    queue: QueueEntryWithGuest[];
  }> {
    const result = pureFinishShoot(this.queue, queueId);
    this.queue = pureApplyReminders(result.updatedQueue);
    return {
      finished: result.finishedEntry,
      queue: [...this.queue],
    };
  }

  async cancelBooking(queueId: string): Promise<{
    cancelled: QueueEntryWithGuest | null;
    queue: QueueEntryWithGuest[];
  }> {
    const result = pureCancelBooking(this.queue, queueId);
    this.queue = pureApplyReminders(result.updatedQueue);
    return {
      cancelled: result.cancelledEntry,
      queue: [...this.queue],
    };
  }

  async addGuest({
    fullName,
    email,
  }: {
    fullName: string;
    email: string;
  }): Promise<{
    guest: Guest;
    queueEntry: QueueEntryWithGuest;
  }> {
    const currentEvent = await this.getCurrentEvent();
    const newGuest: Guest = {
      id: `gst_${Date.now()}`,
      event_id: currentEvent.id,
      full_name: fullName,
      email,
      guest_token: `tok_${Math.random().toString(36).substring(2, 10)}`,
      created_at: new Date().toISOString(),
    };
    this.guests.push(newGuest);

    const result = pureAddGuest(this.queue, newGuest);
    this.queue = pureApplyReminders(result.updatedQueue);

    return {
      guest: newGuest,
      queueEntry: result.newEntry,
    };
  }

  async getGuestByToken(token: string): Promise<{
    guest: Guest;
    queueEntry: QueueEntryWithGuest | null;
    positionInLine: number | null;
  } | null> {
    const guest = this.guests.find((g) => g.guest_token === token);
    if (!guest) return null;

    const queueEntry = this.queue.find((q) => q.guest_id === guest.id) || null;

    let positionInLine: number | null = null;
    if (queueEntry && (queueEntry.status === "WAITING" || queueEntry.status === "REMINDED")) {
      const activeWaiting = this.queue.filter(
        (q) => q.status === "WAITING" || q.status === "REMINDED"
      );
      const idx = activeWaiting.findIndex((q) => q.id === queueEntry.id);
      positionInLine = idx >= 0 ? idx + 1 : null;
    }

    return {
      guest,
      queueEntry,
      positionInLine,
    };
  }
}

// Singleton instance for in-memory & local mock store
export const db: IDataStore = new MockDataStore();
