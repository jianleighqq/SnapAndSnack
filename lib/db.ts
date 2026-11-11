import type { Event, Guest, QueueEntryWithGuest } from "./types";
import { supabaseServer } from "./supabase-server";
import {
  callNext as pureCallNext,
  cancelBooking as pureCancelBooking,
  addGuestToQueue as pureAddGuest,
  reorderWaitingQueue as pureReorderWaitingQueue,
  startShoot as pureStartShoot,
  remindGuest as pureRemindGuest,
  finishShoot as pureFinishShoot,
  refreshStatuses,
} from "./queue";

/**
 * Data Access Layer Interface
 * Reads and writes to Supabase database.
 */
export interface IDataStore {
  // Event Operations
  getEvents(): Promise<Event[]>;
  getEventById(id: string): Promise<Event | null>;
  getActiveEvent(): Promise<Event | null>;
  getCurrentEvent(): Promise<Event | null>;
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
    message?: string;
  }>;
  reorderQueue(orderedWaitingIds: string[]): Promise<QueueEntryWithGuest[]>;
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

  // Print operations
  countPrints(guestId: string): Promise<number>;
  recordPrint(params: {
    guestId: string;
    eventId?: string;
  }): Promise<{
    success: boolean;
    count: number;
    allowed: boolean;
    message?: string;
  }>;
}

const DEFAULT_EVENT: Event = {
  id: "00000000-0000-0000-0000-000000000000",
  name: "Snap & Snack Event",
  event_type: "Corporate",
  event_code: "SNAP26",
  start_time: new Date().toISOString(),
  end_time: new Date(Date.now() + 5 * 3600 * 1000).toISOString(),
  avg_shoot_minutes: 5,
  shots_per_guest: 3,
  max_retakes: 2,
  print_layout: "STRIP",
  max_prints_per_guest: 1,
  status: "ACTIVE",
};

class SupabaseDataStore implements IDataStore {
  // --- Event Operations ---

  async getEvents(): Promise<Event[]> {
    try {
      // Fetch all events from Supabase; order by created_at descending if available, else start_time
      const { data, error } = await supabaseServer
        .from("events")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        // Fallback to start_time ordering if created_at column is missing or errors
        const fallback = await supabaseServer
          .from("events")
          .select("*")
          .order("start_time", { ascending: false });

        if (fallback.error) {
          console.error("Supabase getEvents fallback error:", fallback.error);
          return [];
        }
        return (fallback.data as Event[]) || [];
      }
      return (data as Event[]) || [];
    } catch (err) {
      console.error("Failed to query events from Supabase:", err);
      return [];
    }
  }

  async getEventById(id: string): Promise<Event | null> {
    try {
      const { data, error } = await supabaseServer
        .from("events")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error || !data) return null;
      return data as Event;
    } catch (err) {
      console.error("Failed to query event by ID:", err);
      return null;
    }
  }

  async getActiveEvent(): Promise<Event | null> {
    try {
      // ONE source of truth: directly query Supabase for status = 'ACTIVE' every time
      const { data, error } = await supabaseServer
        .from("events")
        .select("*")
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (error) {
        console.error("Supabase getActiveEvent error:", error);
        return null;
      }

      return (data as Event) || null;
    } catch (err) {
      console.error("Failed to query getActiveEvent from Supabase:", err);
      return null;
    }
  }

  async getCurrentEvent(): Promise<Event | null> {
    return this.getActiveEvent();
  }

  async createEvent(eventData: Omit<Event, "id">): Promise<Event> {
    const insertPayload: Record<string, any> = {
      name: eventData.name,
      event_type: eventData.event_type,
      event_code: eventData.event_code,
      start_time: eventData.start_time,
      end_time: eventData.end_time,
      avg_shoot_minutes: eventData.avg_shoot_minutes,
      shots_per_guest: eventData.shots_per_guest ?? 3,
      max_retakes: eventData.max_retakes ?? 2,
      print_layout: eventData.print_layout ?? "STRIP",
      max_prints_per_guest: eventData.max_prints_per_guest ?? 1,
      status: eventData.status ?? "SCHEDULED",
    };

    const { data, error } = await supabaseServer
      .from("events")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("Supabase createEvent error:", error);
      throw new Error(error.message);
    }
    return data as Event;
  }

  async updateEvent(id: string, updates: Partial<Event>): Promise<Event> {
    const { data, error } = await supabaseServer
      .from("events")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Supabase updateEvent error:", error);
      throw new Error(error.message);
    }
    return data as Event;
  }

  async setActiveEvent(id: string): Promise<Event[]> {
    // 1. Deactivate any currently ACTIVE event first (set to SCHEDULED)
    // Order matters because a unique partial index exists on status = 'ACTIVE'
    const { error: demoteError } = await supabaseServer
      .from("events")
      .update({ status: "SCHEDULED" })
      .eq("status", "ACTIVE");

    if (demoteError) {
      console.error("Supabase demote active events error:", demoteError);
      throw new Error(demoteError.message);
    }

    // 2. Set the chosen event to ACTIVE
    const { error: activateError } = await supabaseServer
      .from("events")
      .update({ status: "ACTIVE" })
      .eq("id", id);

    if (activateError) {
      console.error("Supabase setActiveEvent error:", activateError);
      throw new Error(activateError.message);
    }

    return this.getEvents();
  }

  async closeEvent(id: string): Promise<Event[]> {
    const { error } = await supabaseServer
      .from("events")
      .update({ status: "CLOSED" })
      .eq("id", id);

    if (error) {
      console.error("Supabase closeEvent error:", error);
      throw new Error(error.message);
    }

    return this.getEvents();
  }

  async deleteEvent(id: string): Promise<Event[]> {
    const { error } = await supabaseServer
      .from("events")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Supabase deleteEvent error:", error);
      throw new Error(error.message);
    }

    return this.getEvents();
  }

  async hasActiveQueueForEvent(eventId: string): Promise<boolean> {
    try {
      const { count, error } = await supabaseServer
        .from("queue_entries")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .in("status", ["WAITING", "REMINDED", "IN_PROGRESS"]);

      if (error) return false;
      return (count || 0) > 0;
    } catch {
      return false;
    }
  }

  // --- Queue Operations ---

  async getQueue(): Promise<QueueEntryWithGuest[]> {
    try {
      const currentEvent = await this.getCurrentEvent();
      if (!currentEvent || !currentEvent.id) return [];

      const { data: entries, error: qErr } = await supabaseServer
        .from("queue_entries")
        .select("*")
        .eq("event_id", currentEvent.id)
        .order("queue_number", { ascending: true });

      if (qErr || !entries || entries.length === 0) return [];

      const guestIds = Array.from(new Set(entries.map((e) => e.guest_id).filter(Boolean)));
      const { data: guests, error: gErr } = await supabaseServer
        .from("guests")
        .select("*")
        .in("id", guestIds);

      const guestMap = new Map((guests || []).map((g) => [g.id, g as Guest]));

      return entries.map((e) => ({
        id: e.id,
        event_id: e.event_id,
        guest_id: e.guest_id,
        queue_number: e.queue_number,
        scheduled_shoot_time: e.scheduled_shoot_time,
        status: e.status,
        created_at: e.created_at,
        updated_at: e.updated_at,
        guest: guestMap.get(e.guest_id) || {
          id: e.guest_id,
          event_id: e.event_id,
          full_name: "Guest",
          email: "",
          guest_token: "",
        },
      }));
    } catch (err) {
      console.error("Supabase getQueue error:", err);
      return [];
    }
  }

  async callNext(): Promise<{
    completed: QueueEntryWithGuest | null;
    promoted: QueueEntryWithGuest | null;
    queue: QueueEntryWithGuest[];
    message?: string;
  }> {
    const queue = await this.getQueue();
    const result = pureCallNext(queue);

    if (result.message === "No guests waiting") {
      return {
        completed: null,
        promoted: null,
        queue,
        message: "No guests waiting",
      };
    }

    // Persist all changed records back to Supabase
    const now = new Date().toISOString();
    for (const entry of result.updatedQueue) {
      const original = queue.find((q) => q.id === entry.id);
      if (!original || original.status !== entry.status) {
        await supabaseServer
          .from("queue_entries")
          .update({
            status: entry.status,
            updated_at: now,
          })
          .eq("id", entry.id);
      }
    }

    return {
      completed: result.completedGuest,
      promoted: result.promotedGuest,
      queue: result.updatedQueue,
      message: result.message,
    };
  }

  async reorderQueue(orderedWaitingIds: string[]): Promise<QueueEntryWithGuest[]> {
    const queue = await this.getQueue();
    const updatedQueue = pureReorderWaitingQueue(queue, orderedWaitingIds);

    const now = new Date().toISOString();
    for (const entry of updatedQueue) {
      const original = queue.find((q) => q.id === entry.id);
      if (!original || original.status !== entry.status) {
        await supabaseServer
          .from("queue_entries")
          .update({
            status: entry.status,
            updated_at: now,
          })
          .eq("id", entry.id);
      }
    }

    return updatedQueue;
  }

  async startShoot(queueId: string): Promise<{
    started: QueueEntryWithGuest | null;
    queue: QueueEntryWithGuest[];
  }> {
    const queue = await this.getQueue();
    const result = pureStartShoot(queue, queueId);

    if (result.startedEntry) {
      await supabaseServer
        .from("queue_entries")
        .update({
          status: "IN_PROGRESS",
          updated_at: new Date().toISOString(),
        })
        .eq("id", queueId);
    }

    return {
      started: result.startedEntry,
      queue: result.updatedQueue,
    };
  }

  async remindGuest(queueId: string): Promise<{
    reminded: QueueEntryWithGuest | null;
    queue: QueueEntryWithGuest[];
  }> {
    const queue = await this.getQueue();
    const result = pureRemindGuest(queue, queueId);

    if (result.remindedEntry) {
      await supabaseServer
        .from("queue_entries")
        .update({
          status: "REMINDED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", queueId);
    }

    return {
      reminded: result.remindedEntry,
      queue: result.updatedQueue,
    };
  }

  async finishShoot(queueId: string): Promise<{
    finished: QueueEntryWithGuest | null;
    queue: QueueEntryWithGuest[];
  }> {
    const queue = await this.getQueue();
    const result = pureFinishShoot(queue, queueId);

    if (result.finishedEntry) {
      await supabaseServer
        .from("queue_entries")
        .update({
          status: "COMPLETED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", queueId);
    }

    return {
      finished: result.finishedEntry,
      queue: result.updatedQueue,
    };
  }

  async cancelBooking(queueId: string): Promise<{
    cancelled: QueueEntryWithGuest | null;
    queue: QueueEntryWithGuest[];
  }> {
    const queue = await this.getQueue();
    const result = pureCancelBooking(queue, queueId);

    if (result.cancelledEntry) {
      const now = new Date().toISOString();
      for (const entry of result.updatedQueue) {
        const original = queue.find((q) => q.id === entry.id);
        if (!original || original.status !== entry.status) {
          await supabaseServer
            .from("queue_entries")
            .update({
              status: entry.status,
              updated_at: now,
            })
            .eq("id", entry.id);
        }
      }
    }

    return {
      cancelled: result.cancelledEntry,
      queue: result.updatedQueue,
    };
  }

  async addGuest(params: {
    fullName: string;
    email: string;
  }): Promise<{
    guest: Guest;
    queueEntry: QueueEntryWithGuest;
  }> {
    const currentEvent = await this.getActiveEvent();
    if (!currentEvent) {
      throw new Error("No active event found. Please activate an event in Event Setup first.");
    }

    // Do NOT send id or guest_token on insert - Supabase generates them with defaults
    const guestPayload = {
      event_id: currentEvent.id,
      full_name: params.fullName.trim(),
      email: params.email.trim().toLowerCase(),
    };

    const { data: createdGuest, error: guestError } = await supabaseServer
      .from("guests")
      .insert(guestPayload)
      .select()
      .single();

    if (guestError || !createdGuest) {
      console.error("Supabase insert guest error:", guestError);
      throw new Error(guestError?.message || "Failed to insert guest");
    }

    const newGuest = createdGuest as Guest;
    const queue = await this.getQueue();

    const highestQueueNumber = queue.reduce(
      (max, item) => (item.queue_number > max ? item.queue_number : max),
      0
    );
    const nextQueueNumber = highestQueueNumber + 1;

    // Do NOT send id on insert - Supabase generates uuid primary key
    const queuePayload = {
      event_id: currentEvent.id,
      guest_id: newGuest.id,
      queue_number: nextQueueNumber,
      scheduled_shoot_time: null,
      status: "WAITING" as const,
    };

    const { data: createdQueueEntry, error: queueError } = await supabaseServer
      .from("queue_entries")
      .insert(queuePayload)
      .select()
      .single();

    if (queueError || !createdQueueEntry) {
      console.error("Supabase insert queue entry error:", queueError);
      throw new Error(queueError?.message || "Failed to insert queue entry");
    }

    const newEntry: QueueEntryWithGuest = {
      ...(createdQueueEntry as any),
      guest: newGuest,
    };

    // Recompute statuses using pure refreshStatuses
    const refreshedQueue = refreshStatuses([...queue, newEntry]);

    const now = new Date().toISOString();
    for (const entry of refreshedQueue) {
      if (entry.id === newEntry.id) {
        if (entry.status !== newEntry.status) {
          await supabaseServer
            .from("queue_entries")
            .update({ status: entry.status, updated_at: now })
            .eq("id", entry.id);
        }
      } else {
        const original = queue.find((q) => q.id === entry.id);
        if (original && original.status !== entry.status) {
          await supabaseServer
            .from("queue_entries")
            .update({ status: entry.status, updated_at: now })
            .eq("id", entry.id);
        }
      }
    }

    const finalNewEntry = refreshedQueue.find((e) => e.id === newEntry.id) || newEntry;

    return {
      guest: newGuest,
      queueEntry: finalNewEntry,
    };
  }

  async getGuestByToken(token: string): Promise<{
    guest: Guest;
    queueEntry: QueueEntryWithGuest | null;
    positionInLine: number | null;
  } | null> {
    try {
      const { data: guest, error } = await supabaseServer
        .from("guests")
        .select("*")
        .eq("guest_token", token)
        .maybeSingle();

      if (error || !guest) return null;

      const { data: entries } = await supabaseServer
        .from("queue_entries")
        .select("*")
        .eq("guest_id", guest.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const rawEntry = entries?.[0] || null;
      const queueEntry: QueueEntryWithGuest | null = rawEntry
        ? { ...rawEntry, guest: guest as Guest }
        : null;

      let positionInLine: number | null = null;
      if (queueEntry && (queueEntry.status === "WAITING" || queueEntry.status === "REMINDED")) {
        const { count } = await supabaseServer
          .from("queue_entries")
          .select("id", { count: "exact", head: true })
          .eq("event_id", guest.event_id)
          .in("status", ["WAITING", "REMINDED"])
          .lt("queue_number", queueEntry.queue_number);

        positionInLine = (count || 0) + 1;
      } else if (queueEntry && queueEntry.status === "IN_PROGRESS") {
        positionInLine = 0;
      }

      return {
        guest: guest as Guest,
        queueEntry,
        positionInLine,
      };
    } catch (err) {
      console.error("Supabase getGuestByToken error:", err);
      return null;
    }
  }

  // --- Print Operations ---

  async countPrints(guestId: string): Promise<number> {
    try {
      const { count, error } = await supabaseServer
        .from("print_jobs")
        .select("id", { count: "exact", head: true })
        .eq("guest_id", guestId)
        .eq("status", "PRINTED");

      if (error) {
        console.error("Supabase countPrints error:", error);
        return 0;
      }
      return count || 0;
    } catch (err) {
      console.error("Failed to query countPrints:", err);
      return 0;
    }
  }

  async recordPrint(params: {
    guestId: string;
    eventId?: string;
  }): Promise<{
    success: boolean;
    count: number;
    allowed: boolean;
    message?: string;
  }> {
    const currentEvent = await this.getActiveEvent();
    const maxAllowed = currentEvent?.max_prints_per_guest ?? 1;
    const printedCount = await this.countPrints(params.guestId);

    if (printedCount >= maxAllowed) {
      return {
        success: false,
        count: printedCount,
        allowed: false,
        message: `Print limit reached (${printedCount}/${maxAllowed} prints allowed per guest).`,
      };
    }

    // Do NOT send id - Supabase generates uuid primary key with gen_random_uuid()
    const { error } = await supabaseServer.from("print_jobs").insert({
      event_id: params.eventId || currentEvent?.id,
      guest_id: params.guestId,
      status: "PRINTED",
    });

    if (error) {
      console.error("Supabase recordPrint error:", error);
      return {
        success: false,
        count: printedCount,
        allowed: true,
        message: "Failed to record print job in database.",
      };
    }

    return {
      success: true,
      count: printedCount + 1,
      allowed: true,
    };
  }
}

// Single instance exported behind IDataStore interface
export const db: IDataStore = new SupabaseDataStore();

/**
 * Single source of truth helper: queries Supabase for the active event (status = 'ACTIVE').
 * Never uses module-level caches or fallback mock pointers.
 */
export async function getActiveEvent(): Promise<Event | null> {
  return db.getActiveEvent();
}
