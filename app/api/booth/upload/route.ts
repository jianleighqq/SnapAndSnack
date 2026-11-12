import { NextResponse } from "next/server";
import { getCurrentBoothGuest } from "@/lib/booth";
import { checkBoothRateLimit, getClientIp } from "@/lib/rate-limit";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

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

    if (mediaType !== "PHOTO" && mediaType !== "STRIP") {
      return NextResponse.json(
        { error: "Invalid mediaType: must be PHOTO or STRIP" },
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

    // Determine extension
    let extension = "jpg";
    if (mimeType.includes("png")) extension = "png";
    else if (mimeType.includes("svg")) extension = "svg";
    else if (mimeType.includes("webp")) extension = "webp";

    const timestamp = Date.now();
    const storagePath =
      mediaType === "PHOTO"
        ? `${context.event.id}/${context.guest.id}/shot-${shotNumber || 1}-${timestamp}.${extension}`
        : `${context.event.id}/${context.guest.id}/strip-${timestamp}.${extension}`;

    // Upload to Supabase Storage 'photos' bucket
    const { error: uploadError } = await supabaseServer.storage
      .from("photos")
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error("[Booth Upload] Supabase storage upload error:", uploadError);
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

    // Record in media_assets table strictly scoped to current guest
    const { data: assetData, error: dbError } = await supabaseServer
      .from("media_assets")
      .insert({
        event_id: context.event.id,
        guest_id: context.guest.id,
        session_id: targetSessionId || null,
        storage_path: storagePath,
        public_url: publicUrl,
        media_type: mediaType,
        shot_number: mediaType === "PHOTO" ? shotNumber || 1 : null,
        retake_count: retakeCount ?? 0,
        pose_id: poseId || null,
        in_gallery: false,
      })
      .select("id")
      .single();

    if (dbError) {
      console.error("[Booth Upload] Failed to record media asset:", dbError);
    }

    return NextResponse.json(
      {
        success: true,
        mediaAssetId: assetData?.id || null,
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

