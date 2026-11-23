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

export type PrintLayout = "SINGLE" | "STRIP" | "GRID";

export interface Event {
  id: string;
  name: string;
  event_type: EventType;
  event_code: string;
  start_time: string;
  end_time: string;
  avg_shoot_minutes: number;
  shots_per_guest: number; // 1 to 4, default 3
  max_retakes: number; // default 2 per shot
  print_layout: PrintLayout; // SINGLE | STRIP | GRID
  max_prints_per_guest: number; // 1 to 5, default 1
  include_gif?: boolean; // Optional animated GIF slideshow of kept shots
  template_mode?: "OPERATOR" | "GUEST"; // Operator picks default only vs guests choose
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
  has_alerts?: boolean;
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

export interface PhotoTemplateSlot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PhotoTemplate {
  id: string;
  event_id: string;
  name: string;
  layout: PrintLayout;
  shots_count: number;
  canvas_width: number;
  canvas_height: number;
  slots: PhotoTemplateSlot[];
  frame_path: string | null;
  background_path: string | null;
  frame_url?: string | null; // short-lived signed URL
  background_url?: string | null; // short-lived signed URL
  is_active: boolean;
  is_default?: boolean;
  created_at?: string;
}

export interface ShootSession {
  id: string;
  queue_id: string;
  capture_type: string;
  template_id?: string | null;
  started_at: string;
  ended_at: string | null;
  photos_notified_at?: string | null;
}

export interface Pose {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  sort_order: number;
  image_path?: string | null;
  image_url?: string | null; // short-lived signed URL for client display
  created_at?: string;
}

export interface PushSubscriptionRecord {
  id?: string;
  guest_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at?: string;
}

export interface AlertLog {
  id?: string;
  event_id: string;
  guest_id: string;
  alert_type: "GET_READY" | "YOUR_TURN" | "PHOTOS_READY";
  sent_at?: string;
}


