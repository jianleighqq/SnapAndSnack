import * as webpush from "web-push";
import { supabaseServer } from "@/lib/supabase-server";

// Configure VAPID credentials safely
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:hello@snapandsnack.com";

let isVapidReady = false;
if (vapidPublicKey && vapidPrivateKey) {
  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    isVapidReady = true;
  } catch (err) {
    console.warn("[WebPush] Could not configure VAPID details:", err);
  }
} else {
  console.warn(
    "[WebPush] Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY. Push notifications are in fallback mode."
  );
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Checks whether a guest has at least one active push subscription registered.
 */
export async function checkGuestHasPush(guestId: string): Promise<boolean> {
  if (!guestId) return false;
  try {
    const { count, error } = await supabaseServer
      .from("push_subscriptions")
      .select("endpoint", { count: "exact", head: true })
      .eq("guest_id", guestId);

    if (error) {
      console.warn("[WebPush] checkGuestHasPush error:", error.message);
      return false;
    }
    return (count || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Dispatches a web push notification to all endpoints registered for the guest.
 * Stale or expired endpoints (HTTP 404 / 410) are automatically cleaned up.
 * Never throws: push failures never crash caller or abort operator actions.
 */
export async function sendGuestPush(
  guestId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  if (!guestId) return { sent: 0, failed: 0 };

  if (!isVapidReady) {
    console.warn("[WebPush] Skipped push dispatch: VAPID keys not configured.");
    return { sent: 0, failed: 0 };
  }

  try {
    const { data: subs, error } = await supabaseServer
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("guest_id", guestId);

    if (error || !subs || subs.length === 0) {
      return { sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;
    const staleEndpoints: string[] = [];

    const stringifiedPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || "/guest",
    });

    await Promise.all(
      subs.map(async (sub) => {
        const target = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        try {
          await webpush.sendNotification(target, stringifiedPayload, {
            TTL: 3600, // 1 hour TTL
            urgency: "high",
          });
          sent++;
        } catch (err: any) {
          failed++;
          const status = err?.statusCode || err?.status;
          // HTTP 404 Not Found or 410 Gone indicates the browser/endpoint is unregistered
          if (status === 404 || status === 410) {
            staleEndpoints.push(sub.endpoint);
          } else {
            console.warn(`[WebPush] Push failed for endpoint (${status}):`, err?.message || err);
          }
        }
      })
    );

    // Clean up stale or expired subscriptions if any were detected
    if (staleEndpoints.length > 0) {
      try {
        await supabaseServer
          .from("push_subscriptions")
          .delete()
          .in("endpoint", staleEndpoints);
      } catch (cleanErr) {
        console.warn("[WebPush] Could not delete stale push subscriptions:", cleanErr);
      }
    }

    return { sent, failed };
  } catch (err: any) {
    console.warn("[WebPush] Unhandled error in sendGuestPush:", err?.message || err);
    return { sent: 0, failed: 0 };
  }
}

/**
 * Logs alert dispatch to the alert_logs table for audit and deduplication.
 */
export async function logGuestAlert(
  eventId: string,
  guestId: string,
  alertType: "GET_READY" | "YOUR_TURN"
): Promise<boolean> {
  if (!guestId) return false;

  try {
    const { error } = await supabaseServer.from("alert_logs").insert({
      event_id: eventId,
      guest_id: guestId,
      alert_type: alertType,
      sent_at: new Date().toISOString(),
    });

    if (error) {
      console.warn("[WebPush] Could not log alert to alert_logs:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[WebPush] Error inserting alert_log:", err);
    return false;
  }
}
