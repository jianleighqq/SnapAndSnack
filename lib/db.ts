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
  getActiveEventWithQueue(): Promise<{
    event: Event | null;
    queue: QueueEntryWithGuest[];
  }>;
  getQueue(eventId?: string): Promise<QueueEntryWithGuest[]>;
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

  async getActiveEventWithQueue(): Promise<{
    event: Event | null;
    queue: QueueEntryWithGuest[];
  }> {
    try {
      // Single joined query for active event, ordered queue entries, and associated guests
      const { data, error } = await supabaseServer
        .from("events")
        .select(`
          *,
          queue_entries (
            id,
            event_id,
            guest_id,
            queue_number,
            scheduled_shoot_time,
            status,
            created_at,
            guest:guests (
              id,
              event_id,
              full_name,
              email,
              guest_token,
              created_at
            )
          )
        `)
        .eq("status", "ACTIVE")
        .order("queue_number", { referencedTable: "queue_entries", ascending: true })
        .maybeSingle();

      if (error || !data) {
        if (error) console.error("Supabase getActiveEventWithQueue error:", error);
        return { event: null, queue: [] };
      }

      const { queue_entries, ...eventData } = data;

      const queue: QueueEntryWithGuest[] = (queue_entries || []).map((entry: any) => ({
        id: entry.id,
        event_id: entry.event_id,
        guest_id: entry.guest_id,
        queue_number: entry.queue_number,
        scheduled_shoot_time: entry.scheduled_shoot_time,
        status: entry.status,
        created_at: entry.created_at,
        guest: entry.guest || {
          id: entry.guest_id,
          event_id: entry.event_id,
          full_name: "Guest",
          email: "",
          guest_token: "",
        },
      }));

      return {
        event: eventData as Event,
        queue,
      };
    } catch (err) {
      console.error("Failed to query getActiveEventWithQueue from Supabase:", err);
      return { event: null, queue: [] };
    }
  }

  async getQueue(eventId?: string): Promise<QueueEntryWithGuest[]> {
    try {
      const targetEventId = eventId || (await this.getActiveEvent())?.id;
      if (!targetEventId) return [];

      const { data: entries, error: qErr } = await supabaseServer
        .from("queue_entries")
        .select(`
          id,
          event_id,
          guest_id,
          queue_number,
          scheduled_shoot_time,
          status,
          created_at,
          guest:guests (
            id,
            event_id,
            full_name,
            email,
            guest_token,
            created_at
          )
        `)
        .eq("event_id", targetEventId)
        .order("queue_number", { ascending: true });

      if (qErr || !entries || entries.length === 0) return [];

      return entries.map((entry: any) => ({
        id: entry.id,
        event_id: entry.event_id,
        guest_id: entry.guest_id,
        queue_number: entry.queue_number,
        scheduled_shoot_time: entry.scheduled_shoot_time,
        status: entry.status,
        created_at: entry.created_at,
        guest: entry.guest || {
          id: entry.guest_id,
          event_id: entry.event_id,
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
    const activeEvent = await this.getActiveEvent();
    if (!activeEvent) {
      return { completed: null, promoted: null, queue: [], message: "No active event" };
    }

    const queue = await this.getQueue(activeEvent.id);
    const result = pureCallNext(queue);

    if (result.message === "No guests waiting") {
      return {
        completed: null,
        promoted: null,
        queue,
        message: "No guests waiting",
      };
    }

    const nowIso = new Date().toISOString();

    // End shoot session for completed guest
    if (result.completedGuest) {
      await supabaseServer
        .from("shoot_sessions")
        .update({ ended_at: nowIso })
        .eq("queue_id", result.completedGuest.id)
        .is("ended_at", null);
    }

    // Begin shoot session for promoted guest
    if (result.promotedGuest) {
      await supabaseServer
        .from("shoot_sessions")
        .insert({
          queue_id: result.promotedGuest.id,
          capture_type: "PHOTO",
          started_at: nowIso,
        });
    }

    // Persist all changed records back to Supabase
    for (const entry of result.updatedQueue) {
      const original = queue.find((q) => q.id === entry.id);
      if (!original || original.status !== entry.status) {
        await supabaseServer
          .from("queue_entries")
          .update({ status: entry.status })
          .eq("id", entry.id);
      }
    }

    const finalQueue = await this.getQueue(activeEvent.id);
    return {
      completed: result.completedGuest,
      promoted: result.promotedGuest,
      queue: finalQueue,
      message: result.message,
    };
  }

  async reorderQueue(orderedWaitingIds: string[]): Promise<QueueEntryWithGuest[]> {
    const queue = await this.getQueue();
    const updatedQueue = pureReorderWaitingQueue(queue, orderedWaitingIds);

    for (const entry of updatedQueue) {
      const original = queue.find((q) => q.id === entry.id);
      if (!original || original.status !== entry.status) {
        await supabaseServer
          .from("queue_entries")
          .update({ status: entry.status })
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
    const target = queue.find((q) => q.id === queueId);
    if (!target) {
      throw new Error("Guest queue entry not found");
    }

    const nowIso = new Date().toISOString();

    // If another guest was IN_PROGRESS, complete them first and end their shoot session
    const currentShooting = queue.find((q) => q.status === "IN_PROGRESS" && q.id !== queueId);
    if (currentShooting) {
      await supabaseServer
        .from("queue_entries")
        .update({ status: "COMPLETED" })
        .eq("id", currentShooting.id);

      await supabaseServer
        .from("shoot_sessions")
        .update({ ended_at: nowIso })
        .eq("queue_id", currentShooting.id)
        .is("ended_at", null);
    }

    // 1. Mark target IN_PROGRESS in Supabase
    const { error: startErr } = await supabaseServer
      .from("queue_entries")
      .update({ status: "IN_PROGRESS" })
      .eq("id", queueId);

    if (startErr) {
      console.error("Supabase startShoot error:", startErr);
      throw new Error(startErr.message);
    }

    // 2. Insert new shoot session
    await supabaseServer
      .from("shoot_sessions")
      .insert({
        queue_id: queueId,
        capture_type: "PHOTO",
        started_at: nowIso,
      });

    // 3. Recompute statuses
    const updatedList = queue.map((q) => {
      if (q.id === queueId) return { ...q, status: "IN_PROGRESS" as const };
      if (currentShooting && q.id === currentShooting.id) return { ...q, status: "COMPLETED" as const };
      return q;
    });
    const refreshed = refreshStatuses(updatedList);

    for (const item of refreshed) {
      const original = queue.find((q) => q.id === item.id);
      if (original && original.status !== item.status) {
        await supabaseServer
          .from("queue_entries")
          .update({ status: item.status })
          .eq("id", item.id);
      }
    }

    const finalQueue = await this.getQueue(target.event_id);
    const started = finalQueue.find((q) => q.id === queueId) || null;

    return {
      started,
      queue: finalQueue,
    };
  }

  async remindGuest(queueId: string): Promise<{
    reminded: QueueEntryWithGuest | null;
    queue: QueueEntryWithGuest[];
  }> {
    const queue = await this.getQueue();
    const target = queue.find((q) => q.id === queueId);
    if (!target) {
      throw new Error("Guest queue entry not found");
    }

    const { error: remindErr } = await supabaseServer
      .from("queue_entries")
      .update({ status: "REMINDED" })
      .eq("id", queueId);

    if (remindErr) {
      console.error("Supabase remindGuest error:", remindErr);
      throw new Error(remindErr.message);
    }

    const finalQueue = await this.getQueue(target.event_id);
    const reminded = finalQueue.find((q) => q.id === queueId) || null;

    return {
      reminded,
      queue: finalQueue,
    };
  }

  async finishShoot(queueId: string): Promise<{
    finished: QueueEntryWithGuest | null;
    queue: QueueEntryWithGuest[];
  }> {
    const queue = await this.getQueue();
    const target = queue.find((q) => q.id === queueId);
    if (!target) {
      throw new Error("Guest queue entry not found");
    }

    // Finish is only valid for the IN_PROGRESS guest
    if (target.status !== "IN_PROGRESS") {
      const error: any = new Error("Call this guest first");
      error.statusCode = 409;
      throw error;
    }

    const nowIso = new Date().toISOString();

    // 1. Mark target COMPLETED in Supabase
    const { error: updateErr } = await supabaseServer
      .from("queue_entries")
      .update({ status: "COMPLETED" })
      .eq("id", queueId);

    if (updateErr) {
      console.error("Supabase finishShoot error:", updateErr);
      throw new Error(updateErr.message);
    }

    // 2. End open shoot session
    await supabaseServer
      .from("shoot_sessions")
      .update({ ended_at: nowIso })
      .eq("queue_id", queueId)
      .is("ended_at", null);

    // 3. Re-run pure refreshStatuses and persist any resulting status changes
    const updatedList = queue.map((q) =>
      q.id === queueId ? { ...q, status: "COMPLETED" as const } : q
    );
    const refreshed = refreshStatuses(updatedList);

    for (const item of refreshed) {
      const original = queue.find((q) => q.id === item.id);
      if (original && original.status !== item.status) {
        await supabaseServer
          .from("queue_entries")
          .update({ status: item.status })
          .eq("id", item.id);
      }
    }

    const finalQueue = await this.getQueue(target.event_id);
    const finished = finalQueue.find((q) => q.id === queueId) || null;

    return {
      finished,
      queue: finalQueue,
    };
  }

  async cancelBooking(queueId: string): Promise<{
    cancelled: QueueEntryWithGuest | null;
    queue: QueueEntryWithGuest[];
  }> {
    const queue = await this.getQueue();
    const target = queue.find((q) => q.id === queueId);
    if (!target) {
      throw new Error("Guest queue entry not found");
    }

    const nowIso = new Date().toISOString();

    // 1. Mark target CANCELLED in Supabase (keeps history)
    const { error: cancelErr } = await supabaseServer
      .from("queue_entries")
      .update({ status: "CANCELLED" })
      .eq("id", queueId);

    if (cancelErr) {
      console.error("Supabase cancelBooking error:", cancelErr);
      throw new Error(cancelErr.message);
    }

    // 2. End any open shoot session
    await supabaseServer
      .from("shoot_sessions")
      .update({ ended_at: nowIso })
      .eq("queue_id", queueId)
      .is("ended_at", null);

    // 3. Recompute statuses for remaining active queue
    const updatedList = queue.map((q) =>
      q.id === queueId ? { ...q, status: "CANCELLED" as const } : q
    );
    const refreshed = refreshStatuses(updatedList);

    for (const item of refreshed) {
      const original = queue.find((q) => q.id === item.id);
      if (original && original.status !== item.status) {
        await supabaseServer
          .from("queue_entries")
          .update({ status: item.status })
          .eq("id", item.id);
      }
    }

    const finalQueue = await this.getQueue(target.event_id);
    const cancelled = finalQueue.find((q) => q.id === queueId) || null;

    return {
      cancelled,
      queue: finalQueue,
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
    const queue = await this.getQueue(currentEvent.id);

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

    for (const entry of refreshedQueue) {
      if (entry.id === newEntry.id) {
        if (entry.status !== newEntry.status) {
          await supabaseServer
            .from("queue_entries")
            .update({ status: entry.status })
            .eq("id", entry.id);
        }
      } else {
        const original = queue.find((q) => q.id === entry.id);
        if (original && original.status !== entry.status) {
          await supabaseServer
            .from("queue_entries")
            .update({ status: entry.status })
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
