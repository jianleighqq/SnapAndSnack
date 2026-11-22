import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { checkGuestHasPush, sendGuestPush } from "@/lib/push";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/guest/push?token=...
 * Returns whether the guest currently has an active push subscription.
 */
export async function GET(request: Request) {
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`guest_push_get:${clientIp}`, 60, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again soon." },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token || !token.trim()) {
    return NextResponse.json(
      { error: "Token is required" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const { data: guest, error: guestErr } = await supabaseServer
      .from("guests")
      .select("id")
      .eq("guest_token", token.trim())
      .maybeSingle();

    if (guestErr || !guest) {
      return NextResponse.json(
        { error: "Guest not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const isSubscribed = await checkGuestHasPush(guest.id);
    return NextResponse.json(
      { isSubscribed },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    console.error("[Guest Push API] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

/**
 * POST /api/guest/push
 * Handles:
 * 1. Subscribe (upsert Web Push subscription for guest)
 * 2. Test notification dispatch (action === "test")
 * 3. Unsubscribe (action === "unsubscribe")
 */
export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`guest_push_post:${clientIp}`, 30, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a moment." },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { token, action, subscription } = body;

    if (!token || typeof token !== "string" || !token.trim()) {
      return NextResponse.json(
        { error: "Guest token is required" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { data: guest, error: guestErr } = await supabaseServer
      .from("guests")
      .select("id, full_name, event_id")
      .eq("guest_token", token.trim())
      .maybeSingle();

    if (guestErr || !guest) {
      return NextResponse.json(
        { error: "Invalid guest token" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Action: Test push notification
    if (action === "test") {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const ticketUrl = `${baseUrl}/guest?token=${encodeURIComponent(token.trim())}`;

      const res = await sendGuestPush(guest.id, {
        title: "Snap & Snack",
        body: "Alerts are working! Your phone will vibrate when it's your turn.",
        url: ticketUrl,
      });

      return NextResponse.json(
        {
          success: true,
          sent: res.sent,
          notified: res.sent > 0,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // Action: Unsubscribe
    if (action === "unsubscribe") {
      if (subscription?.endpoint) {
        await supabaseServer
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", subscription.endpoint);
      } else {
        await supabaseServer
          .from("push_subscriptions")
          .delete()
          .eq("guest_id", guest.id);
      }

      return NextResponse.json(
        { success: true },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // Action: Subscribe / Upsert push subscription
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return NextResponse.json(
        { error: "Valid PushSubscription object with endpoint and keys is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { endpoint, keys } = subscription;
    const { p256dh, auth } = keys;

    if (!p256dh || !auth) {
      return NextResponse.json(
        { error: "PushSubscription keys.p256dh and keys.auth are required" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { error: upsertErr } = await supabaseServer
      .from("push_subscriptions")
      .upsert(
        {
          guest_id: guest.id,
          endpoint,
          p256dh,
          auth,
        },
        { onConflict: "endpoint" }
      );

    if (upsertErr) {
      console.error("[Guest Push API] Upsert error:", upsertErr);
      return NextResponse.json(
        { error: "Failed to save push subscription" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { success: true, isSubscribed: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    console.error("[Guest Push API] Exception:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
