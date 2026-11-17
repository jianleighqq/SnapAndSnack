import { NextResponse } from "next/server";
import { getCurrentBoothGuest } from "@/lib/booth";
import { checkBoothRateLimit, getClientIp } from "@/lib/rate-limit";
import { supabaseServer } from "@/lib/supabase-server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return null;
  }
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
  const ip = getClientIp(request);
  const rateLimit = checkBoothRateLimit(ip);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const context = await getCurrentBoothGuest();
    if (!context) {
      return NextResponse.json(
        { error: "No guest is currently in progress" },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    const body = await request.json();
    const { image, mediaType, shotNumber, retakeCount, poseId, sessionId } = body || {};

    if (!image) {
      return NextResponse.json(
        { error: "Missing required image parameter" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (mediaType !== "PHOTO" && mediaType !== "STRIP" && mediaType !== "GIF") {
      return NextResponse.json(
        { error: "Invalid mediaType: must be PHOTO, STRIP, or GIF" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const parsed = parseDataUrl(image);
    if (!parsed) {
      return NextResponse.json(
        { error: "Invalid image format: must be a valid image data URL" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { mimeType, buffer } = parsed;
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json(
        {
          error: `Image exceeds maximum allowed size of 5 MB (${(
            buffer.byteLength /
            1024 /
            1024
          ).toFixed(2)} MB)`,
        },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Resolve or verify session ID for this in-progress guest
    let targetSessionId = sessionId;
    if (!targetSessionId) {
      const { data: sRows } = await supabaseServer
        .from("shoot_sessions")
        .select("id")
        .eq("queue_id", context.queueEntry.id)
        .order("started_at", { ascending: false })
        .limit(1);

      targetSessionId = sRows?.[0]?.id || null;
    }

    if (!targetSessionId) {
      // Ensure an active shoot session exists for this guest
      const session = await db.getOrCreateShootSession(context.queueEntry.id, "Photo");
      targetSessionId = session?.id || null;
    }

    // Determine extension
    let extension = "jpg";
    if (mimeType.includes("png")) extension = "png";
    else if (mimeType.includes("svg")) extension = "svg";
    else if (mimeType.includes("webp")) extension = "webp";
    else if (mimeType.includes("gif")) extension = "gif";

    const timestamp = Date.now();
    const storagePath =
      mediaType === "PHOTO"
        ? `${context.event.id}/${context.guest.id}/shot-${shotNumber || 1}-${timestamp}.${extension}`
        : mediaType === "GIF"
        ? `${context.event.id}/${context.guest.id}/animation.gif`
        : `${context.event.id}/${context.guest.id}/strip-${timestamp}.${extension}`;

    // Upload to Supabase Storage 'photos' bucket
    const { error: uploadError } = await supabaseServer.storage
      .from("photos")
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error("[Booth Upload] Supabase storage upload error:", uploadError.message || uploadError);
      return NextResponse.json(
        { error: "Failed to upload image to storage" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Public URL
    const { data: urlData } = supabaseServer.storage
      .from("photos")
      .getPublicUrl(storagePath);
    const publicUrl = urlData?.publicUrl || storagePath;

    // Sanitize poseId (UUID foreign key in Postgres; store null if not a valid UUID)
    const sanitizedPoseId = poseId && UUID_REGEX.test(poseId) ? poseId : null;

    // Record in media_assets table strictly adhering to schema:
    // (id, session_id, pose_id, media_type, shot_number, retake_count, storage_path, in_gallery, created_at)
    // Note: media_assets does NOT have event_id, guest_id, or public_url.
    let assetId: string | null = null;

    if (mediaType === "PHOTO") {
      // Check existing row for idempotency on Retry Save
      const { data: existing, error: selectErr } = await supabaseServer
        .from("media_assets")
        .select("id")
        .eq("session_id", targetSessionId)
        .eq("media_type", "PHOTO")
        .eq("shot_number", shotNumber || 1)
        .limit(1);

      if (selectErr) {
        console.error("[Booth Upload] Error checking existing photo asset:", selectErr.message || selectErr);
      }

      if (existing && existing.length > 0) {
        const { data: updated, error: updateErr } = await supabaseServer
          .from("media_assets")
          .update({
            storage_path: storagePath,
            retake_count: retakeCount ?? 0,
            pose_id: sanitizedPoseId,
          })
          .eq("id", existing[0].id)
          .select("id")
          .single();

        if (updateErr) {
          console.error("[Booth Upload] Failed to update media asset:", updateErr.message, updateErr.details, updateErr.hint);
          return NextResponse.json(
            { error: "Could not save photo record. Please try again." },
            { status: 500, headers: { "Cache-Control": "no-store" } }
          );
        }
        assetId = updated?.id || existing[0].id;
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
          console.error("[Booth Upload] Failed to insert media asset:", insertErr.message, insertErr.details, insertErr.hint);
          return NextResponse.json(
            { error: "Could not save photo record. Please try again." },
            { status: 500, headers: { "Cache-Control": "no-store" } }
          );
        }
        assetId = inserted?.id || null;
      }
    } else if (mediaType === "GIF") {
      // GIF: Check existing row for idempotency on Retry Save
      const { data: existing, error: selectErr } = await supabaseServer
        .from("media_assets")
        .select("id")
        .eq("session_id", targetSessionId)
        .eq("media_type", "GIF")
        .limit(1);

      if (selectErr) {
        console.error("[Booth Upload] Error checking existing GIF asset:", selectErr.message || selectErr);
      }

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
          console.error("[Booth Upload] Failed to update GIF media asset:", updateErr.message, updateErr.details, updateErr.hint);
          return NextResponse.json(
            { error: "Could not save GIF record. Please try again." },
            { status: 500, headers: { "Cache-Control": "no-store" } }
          );
        }
        assetId = updated?.id || existing[0].id;
      } else {
        const { data: inserted, error: insertErr } = await supabaseServer
          .from("media_assets")
          .insert({
            session_id: targetSessionId,
            media_type: "GIF",
            storage_path: storagePath,
            in_gallery: false,
          })
          .select("id")
          .single();

        if (insertErr) {
          console.error("[Booth Upload] Failed to insert GIF media asset:", insertErr.message, insertErr.details, insertErr.hint);
          return NextResponse.json(
            { error: "Could not save GIF record. Please try again." },
            { status: 500, headers: { "Cache-Control": "no-store" } }
          );
        }
        assetId = inserted?.id || null;
      }
    } else {
      // STRIP: Check existing row for idempotency on Retry Save
      const { data: existing, error: selectErr } = await supabaseServer
        .from("media_assets")
        .select("id")
        .eq("session_id", targetSessionId)
        .eq("media_type", "STRIP")
        .limit(1);

      if (selectErr) {
        console.error("[Booth Upload] Error checking existing strip asset:", selectErr.message || selectErr);
      }

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
          console.error("[Booth Upload] Failed to update strip media asset:", updateErr.message, updateErr.details, updateErr.hint);
          return NextResponse.json(
            { error: "Could not save strip record. Please try again." },
            { status: 500, headers: { "Cache-Control": "no-store" } }
          );
        }
        assetId = updated?.id || existing[0].id;
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
          console.error("[Booth Upload] Failed to insert strip media asset:", insertErr.message, insertErr.details, insertErr.hint);
          return NextResponse.json(
            { error: "Could not save strip record. Please try again." },
            { status: 500, headers: { "Cache-Control": "no-store" } }
          );
        }
        assetId = inserted?.id || null;
      }
    }

    return NextResponse.json(
      {
        success: true,
        mediaAssetId: assetId,
        url: publicUrl,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  } catch (error: any) {
    console.error("[Booth Upload] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

