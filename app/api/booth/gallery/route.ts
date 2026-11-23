import { NextResponse } from "next/server";
import { validateBoothSession, SESSION_GRACE_WINDOW_MS } from "@/lib/booth";
import { checkBoothRateLimit, getClientIp } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { supabaseServer } from "@/lib/supabase-server";
import { sendPhotosReadyEmail, maskEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    const body = await request.json().catch(() => ({}));
    const { sessionId } = body || {};

    const auth = await validateBoothSession(sessionId);
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status, headers: { "Cache-Control": "no-store" } }
      );
    }
    const context = auth.context;

    // 2. Mark media assets in_gallery = true strictly for this session
    const result = await db.saveToGallery({
      sessionId: context.session.id,
    });

    // 3. Confirm at least one media asset is in the gallery
    let hasGalleryAssets = result.success && result.count > 0;
    if (!hasGalleryAssets) {
      const { count: galleryAssetCount } = await supabaseServer
        .from("media_assets")
        .select("id", { count: "exact", head: true })
        .eq("session_id", context.session.id)
        .eq("in_gallery", true);

      hasGalleryAssets = (galleryAssetCount || 0) > 0;
    }

    // 4. Trigger "photos ready" email if guest has email, at least one media asset is in gallery, and hasn't been sent yet
    if (result.success && hasGalleryAssets) {
      const { data: guestRecord } = await supabaseServer
        .from("guests")
        .select("full_name, email")
        .eq("id", context.guest.id)
        .maybeSingle();

      const guestEmail = guestRecord?.email?.trim();

      if (guestEmail && guestEmail.includes("@")) {
        let alreadySent = false;

        // Idempotency check via alert_logs for PHOTOS_READY
        try {
          const { count: existingAlertCount } = await supabaseServer
            .from("alert_logs")
            .select("id", { count: "exact", head: true })
            .eq("guest_id", context.guest.id)
            .eq("alert_type", "PHOTOS_READY");

          if ((existingAlertCount || 0) > 0) {
            alreadySent = true;
          }
        } catch (checkErr) {
          console.warn("[Booth Gallery] Error checking alert_logs for PHOTOS_READY:", checkErr);
        }

        if (!alreadySent) {
          try {
            const emailPromise = sendPhotosReadyEmail({
              to: guestEmail,
              firstName: context.guest.first_name || guestRecord?.full_name?.split(/\s+/)[0] || "Guest",
              eventName: context.event.name || "Snap & Snack Event",
              guestToken: context.guest.guest_token,
            });

            // Strict 6s timeout so email latency never delays the booth response
            const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) =>
              setTimeout(() => resolve({ success: false, error: "Email delivery timeout" }), 6000)
            );

            const emailRes = await Promise.race([emailPromise, timeoutPromise]);
            if (emailRes.success) {
              console.log(`[Booth Gallery] Photos ready email sent to ${maskEmail(guestEmail)}`);
            } else {
              console.warn(`[Booth Gallery] Photos ready email not sent to ${maskEmail(guestEmail)}:`, emailRes.error);
            }

            // Record 'PHOTOS_READY' row in alert_logs for idempotency
            try {
              const { error: insertErr } = await supabaseServer.from("alert_logs").insert({
                event_id: context.event.id,
                guest_id: context.guest.id,
                alert_type: "PHOTOS_READY" as any,
                sent_at: new Date().toISOString(),
              });

              if (insertErr) {
                console.warn(
                  "[Booth Gallery] Could not record PHOTOS_READY in alert_logs (check constraint may require migration):",
                  insertErr.message
                );
              }
            } catch (logErr) {
              console.warn("[Booth Gallery] Error inserting PHOTOS_READY in alert_logs:", logErr);
            }
          } catch (emailErr: any) {
            // Never let email failure break the gallery publish response
            console.warn(`[Booth Gallery] Photos ready email error for ${maskEmail(guestEmail)}:`, emailErr?.message || emailErr);
          }
        }
      }
    }

    return NextResponse.json(
      {
        success: result.success,
        count: result.count,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  } catch (error: any) {
    console.error("[Booth Gallery] Error saving to gallery:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

