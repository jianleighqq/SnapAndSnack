import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  // 1. Rate limiting: 60 requests per minute per IP to protect against brute forcing
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(clientIp, 60, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a minute." },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    // 2. Validate token presence
    if (!token || !token.trim()) {
      return NextResponse.json(
        { error: "Link not found or invalid" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const cleanToken = token.trim();

    // 3. Find guest by guest_token
    const { data: guest, error: guestError } = await supabaseServer
      .from("guests")
      .select("id, full_name, event_id")
      .eq("guest_token", cleanToken)
      .maybeSingle();

    if (guestError || !guest) {
      return NextResponse.json(
        { error: "Link not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 4. Find the guest's queue entry
    const { data: queueRows, error: qError } = await supabaseServer
      .from("queue_entries")
      .select("id, event_id, queue_number, status, scheduled_shoot_time")
      .eq("guest_id", guest.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (qError || !queueRows || queueRows.length === 0) {
      return NextResponse.json(
        { error: "Queue entry not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const queueEntry = queueRows[0];

    // 5. Query event details for event name and average shoot time
    const { data: eventRow } = await supabaseServer
      .from("events")
      .select("name, avg_shoot_minutes")
      .eq("id", queueEntry.event_id)
      .maybeSingle();

    const eventName = eventRow?.name || "Snap & Snack Event";
    const avgMinutes = Math.max(1, eventRow?.avg_shoot_minutes || 3);

    // 6. Compute guests ahead: count of WAITING/REMINDED/IN_PROGRESS entries with lower queue number
    let guestsAhead = 0;
    if (queueEntry.status === "WAITING" || queueEntry.status === "REMINDED") {
      const { count } = await supabaseServer
        .from("queue_entries")
        .select("id", { count: "exact", head: true })
        .eq("event_id", queueEntry.event_id)
        .in("status", ["WAITING", "REMINDED", "IN_PROGRESS"])
        .lt("queue_number", queueEntry.queue_number);

      guestsAhead = count || 0;
    }

    // 7. Calculate estimated wait time
    let estimatedTime: string | null = null;
    if (queueEntry.status === "WAITING") {
      const waitMin = Math.max(1, (guestsAhead + 1) * avgMinutes);
      estimatedTime = `~${waitMin} mins`;
    } else if (queueEntry.status === "REMINDED") {
      estimatedTime = "~5 mins";
    } else if (queueEntry.status === "IN_PROGRESS") {
      estimatedTime = "Now";
    }

    // 8. Check whether a published gallery exists for this guest's sessions
    let hasGallery = false;
    const { data: sessions } = await supabaseServer
      .from("shoot_sessions")
      .select("id")
      .eq("queue_id", queueEntry.id);

    if (sessions && sessions.length > 0) {
      const sessionIds = sessions.map((s) => s.id);
      const { count: galleryAssetCount } = await supabaseServer
        .from("media_assets")
        .select("id", { count: "exact", head: true })
        .in("session_id", sessionIds)
        .eq("in_gallery", true);

      hasGallery = (galleryAssetCount || 0) > 0;
    }

    // Extract first name only (never return email, full name, or tokens)
    const firstName = guest.full_name?.trim().split(/\s+/)[0] || "Guest";

    return NextResponse.json(
      {
        first_name: firstName,
        queue_number: queueEntry.queue_number,
        status: queueEntry.status,
        guests_ahead: guestsAhead,
        estimated_time: estimatedTime,
        event_name: eventName,
        has_gallery: hasGallery,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch (error: any) {
    console.error("GET /api/guest error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
