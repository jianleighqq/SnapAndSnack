import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { validateImageMagicBytes } from "@/lib/image-convert";
import { requireOperatorSession } from "@/lib/auth-server";
import { getCurrentBoothGuest } from "@/lib/booth";
import { checkBoothRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Maximum payload: 25 MB for GIF, 10 MB for standard photos/strips
const MAX_GIF_BYTES = 25 * 1024 * 1024;
const MAX_STANDARD_BYTES = 10 * 1024 * 1024;

// UUID validation regex (8-4-4-4-12 hex)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return null;
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return null;

  const header = dataUrl.slice(5, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);

  const parts = header.split(";");
  const mimeType = parts[0].toLowerCase();
  const isBase64 = parts.includes("base64");

  let buffer: Buffer;
  try {
    if (isBase64) {
      buffer = Buffer.from(payload, "base64");
    } else {
      buffer = Buffer.from(decodeURIComponent(payload), "utf-8");
    }
  } catch {
    return null;
  }

  return { mimeType, buffer };
}

export async function POST(request: Request) {
  // 1. Rate limiting
  const ip = getClientIp(request);
  const rateLimit = checkBoothRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  // 2. Authorization: operator session or active booth guest
  const isOperator = await requireOperatorSession(request);
  const boothContext = !isOperator ? await getCurrentBoothGuest() : null;
  if (!isOperator && !boothContext) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const body = await request.json();
    const {
      image,
      eventId,
      guestId,
      sessionId,
      queueId,
      mediaType,
      shotNumber,
      retakeCount,
      poseId,
    } = body;

    console.log(`[Upload] Processing ${mediaType} upload for guest ${guestId}, event ${eventId}, session ${sessionId}`);

    if (!image || !eventId || !guestId || !mediaType) {
      console.error("[Upload] Missing required parameters:", { eventId, guestId, mediaType, hasImage: !!image });
      return NextResponse.json(
        { error: "Missing required parameters (image, eventId, guestId, mediaType)" },
        { status: 400 }
      );
    }

    if (mediaType !== "PHOTO" && mediaType !== "STRIP" && mediaType !== "GIF") {
      console.error("[Upload] Invalid mediaType:", mediaType);
      return NextResponse.json(
        { error: "Invalid mediaType: must be PHOTO, STRIP, or GIF" },
        { status: 400 }
      );
    }

    // 1. Resolve session ID if not provided or stale
    let targetSessionId = sessionId;
    if (!targetSessionId || !UUID_REGEX.test(targetSessionId)) {
      // Find latest open session for this guest
      const { data: qRows } = await supabaseServer
        .from("queue_entries")
        .select("id")
        .eq("guest_id", guestId)
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(1);

      const resolvedQueueId = queueId || qRows?.[0]?.id;
      if (resolvedQueueId) {
        const { data: sRows } = await supabaseServer
          .from("shoot_sessions")
          .select("id")
          .eq("queue_id", resolvedQueueId)
          .order("started_at", { ascending: false })
          .limit(1);

        targetSessionId = sRows?.[0]?.id || null;
      }
    }

    if (!targetSessionId) {
      console.error("[Upload] Could not resolve session for upload:", { guestId, eventId, queueId });
      return NextResponse.json(
        { error: "Active shoot session not found for this guest" },
        { status: 404 }
      );
    }

    // 2. Parse data URL
    const parsed = parseDataUrl(image);
    if (!parsed) {
      console.error("[Upload] Failed to parse image data URL (header or mime type invalid)");
      return NextResponse.json(
        { error: "Invalid image format: must be a valid image data URL" },
        { status: 400 }
      );
    }

    const { mimeType, buffer } = parsed;
    const maxAllowedBytes = mediaType === "GIF" ? MAX_GIF_BYTES : MAX_STANDARD_BYTES;
    const maxMb = mediaType === "GIF" ? 25 : 10;

    if (buffer.byteLength > maxAllowedBytes) {
      console.error(`[Upload] ${mediaType} payload exceeds ${maxMb}MB: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
      return NextResponse.json(
        { error: `${mediaType} exceeds maximum allowed size of ${maxMb} MB (${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB)` },
        { status: 400 }
      );
    }

    // Verify binary magic bytes (JPEG: FF D8 FF for PHOTO/STRIP; GIF: GIF87a/GIF89a for GIF)
    if (!validateImageMagicBytes(buffer, mediaType as any)) {
      const expected = mediaType === "GIF" ? "GIF87a or GIF89a (47 49 46 38 37|39 61)" : "JPEG (FF D8 FF)";
      return NextResponse.json(
        { error: `Invalid binary image data: ${mediaType} must begin with magic bytes for ${expected}` },
        { status: 400 }
      );
    }

    // 3. Storage path: {event_id}/{guest_id}/shot-{shot_number}.jpg, strip.jpg, or animation.gif
    const storagePath =
      mediaType === "PHOTO"
        ? `${eventId}/${guestId}/shot-${shotNumber || 1}.jpg`
        : mediaType === "GIF"
        ? `${eventId}/${guestId}/animation.gif`
        : `${eventId}/${guestId}/strip.jpg`;

    const storageContentType = mediaType === "GIF" ? "image/gif" : "image/jpeg";

    // 4. Upload to Supabase Storage private 'photos' bucket with upsert: true
    const { error: uploadError } = await supabaseServer.storage
      .from("photos")
      .upload(storagePath, buffer, {
        contentType: storageContentType,
        upsert: true,
      });

    if (uploadError) {
      console.error("[Upload] Supabase Storage upload error:", uploadError);
      return NextResponse.json(
        { error: uploadError.message || "Failed to upload photo to storage" },
        { status: 500 }
      );
    }

    console.log(`[Upload] Stored file successfully at ${storagePath}`);

    // 5. Sanitize pose_id (UUID column in postgres; if string like "couple" or null, store null)
    const sanitizedPoseId = poseId && UUID_REGEX.test(poseId) ? poseId : null;

    // 6. Insert or update media_assets row
    let assetRow: { id: string } | null = null;

    if (mediaType === "PHOTO") {
      const { data: existing } = await supabaseServer
        .from("media_assets")
        .select("id")
        .eq("session_id", targetSessionId)
        .eq("media_type", "PHOTO")
        .eq("shot_number", shotNumber || 1)
        .limit(1);

      if (existing && existing.length > 0) {
        const { data: updated, error: updateErr } = await supabaseServer
          .from("media_assets")
          .update({
            retake_count: retakeCount ?? 0,
            pose_id: sanitizedPoseId,
            storage_path: storagePath,
          })
          .eq("id", existing[0].id)
          .select("id")
          .single();

        if (updateErr) {
          console.error("[Upload] media_assets update error:", updateErr);
          throw new Error(updateErr.message);
        }
        assetRow = updated;
      } else {
        const { data: inserted, error: insertErr } = await supabaseServer
          .from("media_assets")
          .insert({
            session_id: targetSessionId,
            media_type: "PHOTO",
            shot_number: shotNumber || 1,
            retake_count: retakeCount ?? 0,
            pose_id: sanitizedPoseId,
            storage_path: storagePath,
            in_gallery: false,
          })
          .select("id")
          .single();

        if (insertErr) {
          console.error("[Upload] media_assets insert error:", insertErr);
          throw new Error(insertErr.message);
        }
        assetRow = inserted;
      }
    } else if (mediaType === "GIF") {
      // Check if session already has gallery-published assets to avoid race conditions
      const { count: galleryAssetCount } = await supabaseServer
        .from("media_assets")
        .select("id", { count: "exact", head: true })
        .eq("session_id", targetSessionId)
        .eq("in_gallery", true);
      const shouldBeInGallery = (galleryAssetCount || 0) > 0;

      const { data: existing } = await supabaseServer
        .from("media_assets")
        .select("id")
        .eq("session_id", targetSessionId)
        .eq("media_type", "GIF")
        .limit(1);

      if (existing && existing.length > 0) {
        const { data: updated, error: updateErr } = await supabaseServer
          .from("media_assets")
          .update({
            storage_path: storagePath,
            in_gallery: shouldBeInGallery ? true : false,
          })
          .eq("id", existing[0].id)
          .select("id")
          .single();

        if (updateErr) {
          console.error("[Upload] media_assets GIF update error:", updateErr);
          throw new Error(updateErr.message);
        }
        assetRow = updated;
      } else {
        const { data: inserted, error: insertErr } = await supabaseServer
          .from("media_assets")
          .insert({
            session_id: targetSessionId,
            media_type: "GIF",
            storage_path: storagePath,
            in_gallery: shouldBeInGallery ? true : false,
          })
          .select("id")
          .single();

        if (insertErr) {
          console.error("[Upload] media_assets GIF insert error:", insertErr);
          throw new Error(insertErr.message);
        }
        assetRow = inserted;
      }
    } else {
      // STRIP
      const { data: existing } = await supabaseServer
        .from("media_assets")
        .select("id")
        .eq("session_id", targetSessionId)
        .eq("media_type", "STRIP")
        .limit(1);

      if (existing && existing.length > 0) {
        const { data: updated, error: updateErr } = await supabaseServer
          .from("media_assets")
          .update({
            storage_path: storagePath,
          })
          .eq("id", existing[0].id)
          .select("id")
          .single();

        if (updateErr) {
          console.error("[Upload] media_assets STRIP update error:", updateErr);
          throw new Error(updateErr.message);
        }
        assetRow = updated;
      } else {
        const { data: inserted, error: insertErr } = await supabaseServer
          .from("media_assets")
          .insert({
            session_id: targetSessionId,
            media_type: "STRIP",
            storage_path: storagePath,
            in_gallery: false,
          })
          .select("id")
          .single();

        if (insertErr) {
          console.error("[Upload] media_assets STRIP insert error:", insertErr);
          throw new Error(insertErr.message);
        }
        assetRow = inserted;
      }
    }

    console.log(`[Upload] media_assets row created/updated: id=${assetRow?.id}`);

    // 7. Generate 1-hour signed URL (3600 seconds)
    const { data: signedData, error: signError } = await supabaseServer.storage
      .from("photos")
      .createSignedUrl(storagePath, 3600);

    if (signError) {
      console.warn("[Upload] Warning: createSignedUrl error:", signError);
    }

    return NextResponse.json({
      success: true,
      storagePath,
      signedUrl: signedData?.signedUrl || null,
      mediaAssetId: assetRow?.id || null,
    });
  } catch (error: any) {
    console.error("[Upload] POST /api/media/upload unhandled error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error uploading media" },
      { status: 500 }
    );
  }
}
