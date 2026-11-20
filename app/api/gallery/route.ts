import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { db } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isOperator = searchParams.get("operator") === "true";
  const token = searchParams.get("token");

  // 1. Rate limiting on public token requests
  if (!isOperator) {
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(clientIp, 60, 60_000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again in a minute." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
  }

  try {
    // --- OPERATOR VIEW: List all guests in active event with gallery photos ---
    if (isOperator) {
      const activeEvent = await db.getActiveEvent();
      if (!activeEvent) {
        return NextResponse.json({
          event: null,
          guests: [],
        });
      }

      // 1. Query queue entries and guests for active event
      const { data: queueEntries } = await supabaseServer
        .from("queue_entries")
        .select("id, queue_number, guest_id, guests(id, full_name, guest_token)")
        .eq("event_id", activeEvent.id)
        .order("queue_number", { ascending: true });

      if (!queueEntries || queueEntries.length === 0) {
        return NextResponse.json({ event: activeEvent, guests: [] });
      }

      const queueIds = queueEntries.map((q) => q.id);

      // 2. Query sessions for these queue entries
      const { data: sessions } = await supabaseServer
        .from("shoot_sessions")
        .select("id, queue_id")
        .in("queue_id", queueIds);

      if (!sessions || sessions.length === 0) {
        return NextResponse.json({ event: activeEvent, guests: [] });
      }

      const sessionIds = sessions.map((s) => s.id);

      // 3. Query all media_assets where in_gallery = true
      const { data: assets } = await supabaseServer
        .from("media_assets")
        .select("id, session_id, media_type, shot_number, storage_path, created_at")
        .in("session_id", sessionIds)
        .eq("in_gallery", true);

      if (!assets || assets.length === 0) {
        return NextResponse.json({ event: activeEvent, guests: [] });
      }

      // Map session_id -> queue_entry
      const sessionToQueue = new Map<string, any>();
      for (const s of sessions) {
        const q = queueEntries.find((qe) => qe.id === s.queue_id);
        if (q) sessionToQueue.set(s.id, q);
      }

      // Generate signed URLs for assets
      const guestsMap = new Map<string, any>();

      for (const asset of assets) {
        const q = sessionToQueue.get(asset.session_id);
        if (!q || !q.guests) continue;

        const guestId = q.guest_id;
        if (!guestsMap.has(guestId)) {
          guestsMap.set(guestId, {
            guest_id: guestId,
            full_name: q.guests.full_name,
            queue_number: q.queue_number,
            guest_token: q.guests.guest_token,
            strip: null,
            gif: null,
            photos: [],
          });
        }

        const guestRecord = guestsMap.get(guestId);
        const { data: signed } = await supabaseServer.storage
          .from("photos")
          .createSignedUrl(asset.storage_path, 3600);

        const signedUrl = signed?.signedUrl || null;
        if (asset.media_type === "STRIP") {
          guestRecord.strip = {
            id: asset.id,
            storage_path: asset.storage_path,
            signed_url: signedUrl,
            created_at: asset.created_at,
          };
        } else if (asset.media_type === "GIF") {
          guestRecord.gif = {
            id: asset.id,
            storage_path: asset.storage_path,
            signed_url: signedUrl,
            created_at: asset.created_at,
          };
        } else {
          guestRecord.photos.push({
            id: asset.id,
            shot_number: asset.shot_number,
            storage_path: asset.storage_path,
            signed_url: signedUrl,
            created_at: asset.created_at,
          });
        }
      }

      const guestList = Array.from(guestsMap.values()).sort(
        (a, b) => a.queue_number - b.queue_number
      );

      return NextResponse.json({
        event: activeEvent,
        guests: guestList,
      });
    }

    // --- FRESH SIGNED URL FOR SPECIFIC ASSET DOWNLOAD ---
    const assetId = searchParams.get("assetId");
    if (assetId) {
      if (!token || !token.trim()) {
        return NextResponse.json(
          { error: "Valid gallery token is required" },
          { status: 404, headers: { "Cache-Control": "no-store" } }
        );
      }

      const cleanToken = token.trim();
      const { data: guest, error: gErr } = await supabaseServer
        .from("guests")
        .select("id")
        .eq("guest_token", cleanToken)
        .maybeSingle();

      if (gErr || !guest) {
        return NextResponse.json(
          { error: "Gallery not found" },
          { status: 404, headers: { "Cache-Control": "no-store" } }
        );
      }

      const { data: asset, error: aErr } = await supabaseServer
        .from("media_assets")
        .select("id, session_id, storage_path, media_type, shot_number")
        .eq("id", assetId)
        .maybeSingle();

      if (aErr || !asset) {
        return NextResponse.json(
          { error: "Media asset not found" },
          { status: 404, headers: { "Cache-Control": "no-store" } }
        );
      }

      // Generate a fresh signed URL (valid for 5 minutes)
      const { data: signed, error: signErr } = await supabaseServer.storage
        .from("photos")
        .createSignedUrl(asset.storage_path, 300);

      if (signErr || !signed?.signedUrl) {
        return NextResponse.json(
          { error: "Failed to generate fresh signed download URL" },
          { status: 500, headers: { "Cache-Control": "no-store" } }
        );
      }

      return NextResponse.json(
        {
          success: true,
          signedUrl: signed.signedUrl,
          mediaType: asset.media_type,
          shotNumber: asset.shot_number,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // --- GUEST VIEW: Specific guest gallery by token ---
    if (!token || !token.trim()) {
      return NextResponse.json(
        { error: "Valid gallery token is required" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const cleanToken = token.trim();

    // 1. Resolve token -> guest
    const { data: guest, error: gErr } = await supabaseServer
      .from("guests")
      .select("id, full_name, event_id")
      .eq("guest_token", cleanToken)
      .maybeSingle();

    console.log(`[Gallery] 1. Token query: "${cleanToken}" -> Guest:`, guest ? `${guest.id} (${guest.full_name})` : "Not found");

    if (gErr || !guest) {
      return NextResponse.json(
        { error: "Gallery not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 2. Resolve guest -> queue_entries (all queue entries for this guest)
    const { data: queueRows } = await supabaseServer
      .from("queue_entries")
      .select("id, queue_number")
      .eq("guest_id", guest.id)
      .order("created_at", { ascending: false });

    const queueCount = queueRows?.length || 0;
    const queueIds = queueRows?.map((q) => q.id) || [];
    const queueNumber = queueRows?.[0]?.queue_number ?? null;

    console.log(`[Gallery] 2. Resolved ${queueCount} queue entries for guest ${guest.id}`);

    // 3. Find event name
    const { data: eventRow } = await supabaseServer
      .from("events")
      .select("name")
      .eq("id", guest.event_id)
      .maybeSingle();

    const eventName = eventRow?.name || "Snap & Snack Event";
    const firstName = guest.full_name?.trim().split(/\s+/)[0] || "Guest";

    if (queueIds.length === 0) {
      console.log(`[Gallery] No queue entries found for guest ${guest.id}`);
      return NextResponse.json({
        event_name: eventName,
        first_name: firstName,
        queue_number: queueNumber,
        strip: null,
        gif: null,
        photos: [],
      });
    }

    // 4. Resolve queue_entries -> shoot_sessions (including guests with multiple sessions)
    const { data: sessions } = await supabaseServer
      .from("shoot_sessions")
      .select("id, queue_id, started_at")
      .in("queue_id", queueIds)
      .order("started_at", { ascending: false });

    const sessionCount = sessions?.length || 0;
    const sessionIds = sessions?.map((s) => s.id) || [];

    console.log(`[Gallery] 3. Resolved ${sessionCount} shoot sessions for guest ${guest.id}`);

    if (sessionIds.length === 0) {
      console.log(`[Gallery] No shoot sessions found for guest ${guest.id}`);
      return NextResponse.json({
        event_name: eventName,
        first_name: firstName,
        queue_number: queueNumber,
        strip: null,
        gif: null,
        photos: [],
      });
    }

    // 5. Resolve shoot_sessions -> media_assets where in_gallery = true
    const { data: assets } = await supabaseServer
      .from("media_assets")
      .select("id, media_type, shot_number, storage_path, created_at")
      .in("session_id", sessionIds)
      .eq("in_gallery", true);

    const assetCount = assets?.length || 0;
    console.log(`[Gallery] 4. Found ${assetCount} media assets with in_gallery = true for guest ${guest.id}`);

    if (assetCount === 0) {
      return NextResponse.json({
        event_name: eventName,
        first_name: firstName,
        queue_number: queueNumber,
        strip: null,
        gif: null,
        photos: [],
      });
    }

    // 6. Generate signed URLs (1 hour)
    let strip: any = null;
    let gif: any = null;
    const photos: any[] = [];

    for (const asset of assets!) {
      const { data: signed } = await supabaseServer.storage
        .from("photos")
        .createSignedUrl(asset.storage_path, 3600);

      const signedUrl = signed?.signedUrl || null;

      if (asset.media_type === "STRIP") {
        strip = {
          id: asset.id,
          storage_path: asset.storage_path,
          signed_url: signedUrl,
          created_at: asset.created_at,
        };
      } else if (asset.media_type === "GIF") {
        gif = {
          id: asset.id,
          storage_path: asset.storage_path,
          signed_url: signedUrl,
          created_at: asset.created_at,
        };
      } else {
        photos.push({
          id: asset.id,
          shot_number: asset.shot_number || 1,
          storage_path: asset.storage_path,
          signed_url: signedUrl,
          created_at: asset.created_at,
        });
      }
    }

    // Sort photos by shot number
    photos.sort((a, b) => a.shot_number - b.shot_number);

    console.log(`[Gallery] 5. Signed URLs generated: strip=${strip ? "YES" : "NO"}, gif=${gif ? "YES" : "NO"}, photos=${photos.length}`);

    return NextResponse.json(
      {
        event_name: eventName,
        first_name: firstName,
        queue_number: queueNumber,
        strip,
        gif,
        photos,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch (error: any) {
    console.error("[Gallery] GET /api/gallery error:", error);
    return NextResponse.json(
      { error: "Internal server error fetching gallery" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, guestId, eventId } = body;

    console.log(`[Gallery] POST /api/gallery received:`, { sessionId, guestId, eventId });

    if (!sessionId && !guestId) {
      return NextResponse.json(
        { error: "sessionId or guestId is required" },
        { status: 400 }
      );
    }

    const result = await db.saveToGallery({ sessionId, guestId, eventId });
    console.log(`[Gallery] db.saveToGallery result:`, result);

    if (!result.success || result.count === 0) {
      return NextResponse.json(
        {
          error: "Could not save your photos, please try again. No photos were found for this session.",
          count: 0,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Gallery] POST /api/gallery error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update gallery status" },
      { status: 500 }
    );
  }
}
