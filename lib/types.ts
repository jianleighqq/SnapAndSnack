export type QueueStatus =
  | "WAITING"
  | "REMINDED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type EventType =
  | "Wedding"
  | "Birthday"
  | "Graduation"
  | "Corporate"
  | "School"
  | "Other";

export type EventStatus = "SCHEDULED" | "ACTIVE" | "CLOSED";

export interface Event {
  id: string;
  name: string;
  event_type: EventType;
  event_code: string;
  start_time: string;
  end_time: string;
  avg_shoot_minutes: number;
  status: EventStatus;
  created_at?: string;
}

export interface Guest {
  id: string;
  event_id: string;
  full_name: string;
  email: string;
  guest_token: string;
  created_at?: string;
}

export interface QueueItem {
  id: string;
  event_id: string;
  guest_id: string;
  queue_number: number;
  scheduled_shoot_time: string | null;
  status: QueueStatus;
  created_at?: string;
  updated_at?: string;
}

/**
 * Denormalized queue record joined with guest info for display in the Queue Board
 * and Operator Shoot Console.
 */
export interface QueueEntryWithGuest extends QueueItem {
  guest: Guest;
}

export interface ShootMedia {
  id: string;
  event_id: string;
  guest_id: string;
  file_url: string;
  preview_url: string;
  taken_at: string;
  drive_synced?: boolean;
}
