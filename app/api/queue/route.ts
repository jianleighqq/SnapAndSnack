import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendGuestPush, logGuestAlert } from "@/lib/push";
import { requireOperatorSession } from "@/lib/auth-server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { queueActionSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const { event, queue } = await db.getActiveEventWithQueue();
    // Security: Never expose guest tokens in the general queue list response
    const sanitizedQueue = (queue || []).map((entry) => ({
      ...entry,
      guest: {
        ...entry.guest,
        guest_token: "",
      },
    }));

    return NextResponse.json(
      { event, queue: sanitizedQueue },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error: any) {
    console.error("GET /api/queue error:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to fetch queue data" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}

export async function POST(request: Request) {
  // Rate limiting: 60 requests per minute per IP
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`queue_post:${clientIp}`, 60, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a minute." },
      { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } }
    );
  }

  try {
    const rawBody = await request.json().catch(() => ({}));
    const parseRes = queueActionSchema.safeParse(rawBody);

    if (!parseRes.success) {
      return NextResponse.json(
        { error: parseRes.error.issues[0]?.message || "Invalid queue request" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { action, queueId, guestToken, fullName, email } = parseRes.data;

    // Authorization:
    // Only guest-self-cancellation with a valid guestToken is permitted without operator session.
    // All other operations (addGuest, start, remind, finish, callNext, or operator-driven cancel by queueId)
    // require a verified operator session.
    const isOperator = await requireOperatorSession(request);
    const isGuestCancel = action === "cancel" && Boolean(guestToken && guestToken.trim());

    if (!isOperator && !isGuestCancel) {
      return NextResponse.json(
        { error: "Unauthorized: Operator session required" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    let targetQueueId = queueId;

    // If guestToken is provided instead of queueId (e.g. from customer phone view)
    if (!targetQueueId && guestToken) {
      const guestData = await db.getGuestByToken(guestToken);
      if (!guestData || !guestData.queueEntry) {
        return NextResponse.json(
          { error: "Guest not found or has no active queue entry" },
          { status: 404, headers: { "Cache-Control": "no-store" } }
        );
      }
      targetQueueId = guestData.queueEntry.id;
    }

    let notified = false;

    switch (action) {
      case "addGuest": {
        if (!fullName || !fullName.trim()) {
          return NextResponse.json(
            { error: "fullName is required" },
            { status: 400, headers: { "Cache-Control": "no-store" } }
          );
        }
        await db.addGuest({
          fullName: fullName.trim(),
          email: typeof email === "string" ? email.trim().toLowerCase() : "",
        });
        break;
      }

      case "start":
        if (!targetQueueId) return NextResponse.json({ error: "queueId required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
        await db.startShoot(targetQueueId);
        break;

      case "remind": {
        if (!targetQueueId) return NextResponse.json({ error: "queueId required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
        const remindRes = await db.remindGuest(targetQueueId);
        if (remindRes.reminded && remindRes.reminded.guest) {
          const guest = remindRes.reminded.guest;
          const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
          const ticketUrl = `${baseUrl}/guest?token=${encodeURIComponent(guest.guest_token)}`;
          const pushRes = await sendGuestPush(guest.id, {
            title: "Get ready!",
            body: "You're next at the photo booth. Please come to the booth now.",
            url: ticketUrl,
          });
          notified = pushRes.sent > 0;
          await logGuestAlert(remindRes.reminded.event_id, guest.id, "GET_READY");
        }
        break;
      }

      case "finish":
        if (!targetQueueId) return NextResponse.json({ error: "queueId required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
        await db.finishShoot(targetQueueId);
        break;

      case "cancel":
        if (!targetQueueId) return NextResponse.json({ error: "queueId or guestToken required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
        await db.cancelBooking(targetQueueId);
        break;

      case "callNext": {
        const callNextRes = await db.callNext();
        if (callNextRes.promoted && callNextRes.promoted.guest) {
          const guest = callNextRes.promoted.guest;
          const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
          const ticketUrl = `${baseUrl}/guest?token=${encodeURIComponent(guest.guest_token)}`;
          const pushRes = await sendGuestPush(guest.id, {
            title: "It's your turn!",
            body: "Please come to the photo booth.",
            url: ticketUrl,
          });
          notified = pushRes.sent > 0;
          await logGuestAlert(callNextRes.promoted.event_id, guest.id, "YOUR_TURN");
        }
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    const { event, queue } = await db.getActiveEventWithQueue();
    // Security: Never expose guest tokens in the general queue list response
    const sanitizedQueue = (queue || []).map((entry) => ({
      ...entry,
      guest: {
        ...entry.guest,
        guest_token: "",
      },
    }));

    return NextResponse.json(
      {
        success: true,
        event,
        queue: sanitizedQueue,
        notified,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error: any) {
    console.error("Queue API Error:", error?.message || error);
    const statusCode = error.statusCode || 500;
    return NextResponse.json(
      {
        error: error.message || "Failed to process queue action",
      },
      {
        status: statusCode,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}
