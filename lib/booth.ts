import { db } from "./db";
import { supabaseServer } from "./supabase-server";
import type { PhotoTemplate, Pose } from "./types";
import { seedPosesIfEmpty, attachSignedPoseUrl } from "./poses";

export interface BoothGuestContext {
  event: {
    id: string;
    name: string;
    event_code: string;
    shots_per_guest: number;
    max_retakes: number;
    print_layout: string;
    max_prints_per_guest: number;
    include_gif?: boolean;
    template_mode?: "OPERATOR" | "GUEST";
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
  eligibleTemplates: PhotoTemplate[];
  poses: Pose[];
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

  // Retrieve eligible templates for this event (is_active = true, shots_count matches)
  const eligibleTemplates: PhotoTemplate[] = [];
  let defaultTemplate: PhotoTemplate | null = null;

  try {
    const { data: templates } = await supabaseServer
      .from("templates")
      .select("*")
      .eq("event_id", activeEvent.id)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (templates && templates.length > 0) {
      for (const t of templates) {
        // Exclude templates whose shots count does not match the event's shots_per_guest
        const targetShots = activeEvent.shots_per_guest ?? 3;
        if (t.shots_count !== targetShots) {
          continue;
        }

        let frame_url: string | null = null;
        let background_url: string | null = null;

        if (t.frame_path) {
          const { data: signedFrame } = await supabaseServer.storage
            .from("templates")
            .createSignedUrl(t.frame_path, 3600);
          frame_url = signedFrame?.signedUrl || null;
        }

        if (t.background_path) {
          const { data: signedBg } = await supabaseServer.storage
            .from("templates")
            .createSignedUrl(t.background_path, 3600);
          background_url = signedBg?.signedUrl || null;
        }

        const fullTemplate: PhotoTemplate = {
          ...t,
          frame_url,
          background_url,
        };

        eligibleTemplates.push(fullTemplate);
      }

      // Default template is either marked is_default or first eligible
      defaultTemplate =
        eligibleTemplates.find((t) => t.is_default) ||
        eligibleTemplates[0] ||
        null;
    }
  } catch (err) {
    console.warn("Could not load eligible templates for booth:", err);
  }

  // Retrieve active poses with signed URLs
  let poses: Pose[] = [];
  try {
    await seedPosesIfEmpty();
    const { data: dbPoses } = await supabaseServer
      .from("poses")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (dbPoses && dbPoses.length > 0) {
      poses = await Promise.all(dbPoses.map(attachSignedPoseUrl));
    }
  } catch (pErr) {
    console.warn("Could not load active poses for booth:", pErr);
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
      include_gif: activeEvent.include_gif ?? false,
      template_mode: activeEvent.template_mode || "OPERATOR",
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
    template: defaultTemplate,
    eligibleTemplates,
    poses,
    qrUrl,
  };
}

