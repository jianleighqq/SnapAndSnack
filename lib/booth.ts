import { db } from "./db";
import { supabaseServer } from "./supabase-server";
import type { PhotoTemplate, Pose } from "./types";
import { seedPosesIfEmpty, attachSignedPoseUrl } from "./poses";

/**
 * Grace window allowing upload and publish operations to complete
 * up to 15 minutes after a shoot session is finished or a guest is completed.
 */
export const SESSION_GRACE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuthorizedBoothSessionContext {
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
    event_id: string;
    guest_id: string;
    queue_number: number;
    status: string;
  };
  guest: {
    id: string;
    full_name: string;
    first_name: string;
    email: string | null;
    guest_token: string;
  };
  session: {
    id: string;
    queue_id: string;
    capture_type: string;
    template_id: string | null;
    started_at: string;
    ended_at: string | null;
  };
}

export type ValidateBoothSessionResult =
  | { success: true; context: AuthorizedBoothSessionContext }
  | { success: false; status: number; code: string; error: string };

/**
 * Validates a shoot session for booth API requests.
 * 
 * Rules:
 * 1. The shoot_session must exist.
 * 2. It must belong to a queue entry in the currently ACTIVE event.
 * 3. Either the queue entry is still IN_PROGRESS, or the session ended (ended_at) /
 *    guest was completed within the 15-minute grace window.
 * Rejections are logged with a reason code and session ID (no personal data).
 */
export async function validateBoothSession(
  sessionId?: string | null
): Promise<ValidateBoothSessionResult> {
  if (!sessionId || typeof sessionId !== "string" || !UUID_REGEX.test(sessionId)) {
    console.warn(`[Booth Auth] Rejection: code=INVALID_SESSION_ID, session=${sessionId || "none"}`);
    return {
      success: false,
      status: 400,
      code: "INVALID_SESSION_ID",
      error: "A valid sessionId is required",
    };
  }

  const activeEvent = await db.getActiveEvent();
  if (!activeEvent) {
    console.warn(`[Booth Auth] Rejection: code=NO_ACTIVE_EVENT, session=${sessionId}`);
    return {
      success: false,
      status: 409,
      code: "NO_ACTIVE_EVENT",
      error: "No event is currently active",
    };
  }

  // 1. Fetch shoot session record
  const { data: session, error: sessionErr } = await supabaseServer
    .from("shoot_sessions")
    .select("id, queue_id, capture_type, template_id, started_at, ended_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionErr || !session) {
    console.warn(`[Booth Auth] Rejection: code=SESSION_NOT_FOUND, session=${sessionId}`);
    return {
      success: false,
      status: 404,
      code: "SESSION_NOT_FOUND",
      error: "Shoot session not found",
    };
  }

  // 2. Fetch associated queue entry
  const { data: queueEntry, error: queueErr } = await supabaseServer
    .from("queue_entries")
    .select("id, event_id, guest_id, queue_number, status, created_at")
    .eq("id", session.queue_id)
    .maybeSingle();

  if (queueErr || !queueEntry) {
    console.warn(`[Booth Auth] Rejection: code=QUEUE_ENTRY_NOT_FOUND, session=${sessionId}`);
    return {
      success: false,
      status: 404,
      code: "QUEUE_ENTRY_NOT_FOUND",
      error: "Queue entry for shoot session not found",
    };
  }

  // 3. Verify session belongs to the currently active event
  if (queueEntry.event_id !== activeEvent.id) {
    console.warn(`[Booth Auth] Rejection: code=EVENT_MISMATCH, session=${sessionId}`);
    return {
      success: false,
      status: 403,
      code: "EVENT_MISMATCH",
      error: "Shoot session does not belong to the active event",
    };
  }

  // 4. Verify status: guest is IN_PROGRESS OR session ended/completed within 15m grace window
  const isGuestInProgress = queueEntry.status === "IN_PROGRESS";
  if (!isGuestInProgress) {
    let endedAtTime: number | null = null;
    if (session.ended_at) {
      endedAtTime = new Date(session.ended_at).getTime();
    } else if (queueEntry.status === "COMPLETED") {
      endedAtTime = session.started_at ? new Date(session.started_at).getTime() : null;
    }

    if (endedAtTime !== null && !isNaN(endedAtTime)) {
      const elapsedMs = Date.now() - endedAtTime;
      // Allow up to SESSION_GRACE_WINDOW_MS (and slight negative delta for minor clock drift)
      const withinGrace = elapsedMs <= SESSION_GRACE_WINDOW_MS && elapsedMs >= -60_000;
      if (!withinGrace) {
        console.warn(`[Booth Auth] Rejection: code=SESSION_EXPIRED, session=${sessionId}`);
        return {
          success: false,
          status: 409,
          code: "SESSION_EXPIRED",
          error: "Shoot session has expired (outside 15-minute grace window)",
        };
      }
    } else {
      console.warn(`[Booth Auth] Rejection: code=SESSION_INACTIVE, session=${sessionId}`);
      return {
        success: false,
        status: 409,
        code: "SESSION_INACTIVE",
        error: `Shoot session is no longer active (status: ${queueEntry.status})`,
      };
    }
  }

  // 5. Fetch guest details
  const { data: guest, error: guestErr } = await supabaseServer
    .from("guests")
    .select("id, full_name, email, guest_token")
    .eq("id", queueEntry.guest_id)
    .maybeSingle();

  if (guestErr || !guest) {
    console.warn(`[Booth Auth] Rejection: code=GUEST_NOT_FOUND, session=${sessionId}`);
    return {
      success: false,
      status: 404,
      code: "GUEST_NOT_FOUND",
      error: "Guest for shoot session not found",
    };
  }

  return {
    success: true,
    context: {
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
        id: queueEntry.id,
        event_id: queueEntry.event_id,
        guest_id: queueEntry.guest_id,
        queue_number: queueEntry.queue_number,
        status: queueEntry.status,
      },
      guest: {
        id: guest.id,
        full_name: guest.full_name || "Guest",
        first_name: extractFirstName(guest.full_name),
        email: guest.email || null,
        guest_token: guest.guest_token,
      },
      session: {
        id: session.id,
        queue_id: session.queue_id,
        capture_type: session.capture_type,
        template_id: session.template_id || null,
        started_at: session.started_at,
        ended_at: session.ended_at || null,
      },
    },
  };
}

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

