import { db } from "./db";
import { supabaseServer } from "./supabase-server";
import type { PhotoTemplate } from "./types";

export interface BoothGuestContext {
  event: {
    id: string;
    name: string;
    event_code: string;
    shots_per_guest: number;
    max_retakes: number;
    print_layout: string;
    max_prints_per_guest: number;
    start_time: string;
  };
  queueEntry: {
    id: string;
    queue_number: number;
    status: string;
  };
  guest: {
    id: string;
    first_name: string;
    queue_number: number;
    // Kept server-side for QR URL generation, never leaked via GET /api/booth/current
    guest_token: string;
  };
  template: PhotoTemplate | null;
  qrUrl: string;
}

/**
 * Extracts first name safely from full name.
 * Falls back to "Guest" if empty or absent.
 */
export function extractFirstName(fullName?: string | null): string {
  if (!fullName) return "Guest";
  const trimmed = fullName.trim();
  if (!trimmed) return "Guest";
  return trimmed.split(/\s+/)[0] || "Guest";
}

/**
 * Returns the sanitized context of the single IN_PROGRESS guest for the currently ACTIVE event.
 * If no event is active or no guest is IN_PROGRESS, returns null.
 */
export async function getCurrentBoothGuest(): Promise<BoothGuestContext | null> {
  const activeEvent = await db.getActiveEvent();
  if (!activeEvent) return null;

  const queue = await db.getQueue(activeEvent.id);
  const inProgress = queue.find((entry) => entry.status === "IN_PROGRESS");
  if (!inProgress || !inProgress.guest) return null;

  // Retrieve active template for this event if one exists
  let activeTemplate: PhotoTemplate | null = null;
  try {
    const { data: template } = await supabaseServer
      .from("templates")
      .select("*")
      .eq("event_id", activeEvent.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (template) {
      let frame_url: string | null = null;
      let background_url: string | null = null;

      if (template.frame_path) {
        const { data: signedFrame } = await supabaseServer.storage
          .from("templates")
          .createSignedUrl(template.frame_path, 3600);
        frame_url = signedFrame?.signedUrl || null;
      }

      if (template.background_path) {
        const { data: signedBg } = await supabaseServer.storage
          .from("templates")
          .createSignedUrl(template.background_path, 3600);
        background_url = signedBg?.signedUrl || null;
      }

      activeTemplate = {
        ...template,
        frame_url,
        background_url,
      };
    }
  } catch (err) {
    console.warn("Could not load active template for booth:", err);
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const qrUrl = `${baseUrl}/gallery?token=${inProgress.guest.guest_token}`;

  return {
    event: {
      id: activeEvent.id,
      name: activeEvent.name,
      event_code: activeEvent.event_code,
      shots_per_guest: activeEvent.shots_per_guest ?? 3,
      max_retakes: activeEvent.max_retakes ?? 2,
      print_layout: activeEvent.print_layout ?? "STRIP",
      max_prints_per_guest: activeEvent.max_prints_per_guest ?? 1,
      start_time: activeEvent.start_time,
    },
    queueEntry: {
      id: inProgress.id,
      queue_number: inProgress.queue_number,
      status: inProgress.status,
    },
    guest: {
      id: inProgress.guest.id,
      first_name: extractFirstName(inProgress.guest.full_name),
      queue_number: inProgress.queue_number,
      guest_token: inProgress.guest.guest_token,
    },
    template: activeTemplate,
    qrUrl,
  };
}

