import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendGuestPush, logGuestAlert } from "@/lib/push";

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
  } catch (error) {
    console.error("GET /api/queue error:", error);
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
  try {
    const body = await request.json();
    const { action, queueId, guestToken, fullName, email } = body;

    let targetQueueId = queueId;

    // If guestToken is provided instead of queueId (e.g. from customer phone view)
    if (!targetQueueId && guestToken) {
      const guestData = await db.getGuestByToken(guestToken);
      if (!guestData || !guestData.queueEntry) {
        return NextResponse.json(
          { error: "Guest not found or has no active queue entry" },
          { status: 404 }
        );
      }
      targetQueueId = guestData.queueEntry.id;
    }

    if (!action) {
      return NextResponse.json(
        { error: "Action is required" },
        { status: 400 }
      );
    }

    let notified = false;

    switch (action) {
      case "addGuest": {
        if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
          return NextResponse.json(
            { error: "fullName is required" },
            { status: 400 }
          );
        }
        await db.addGuest({
          fullName: fullName.trim(),
          email: typeof email === "string" ? email.trim().toLowerCase() : "",
        });
        break;
      }

      case "start":
        if (!targetQueueId) return NextResponse.json({ error: "queueId required" }, { status: 400 });
        await db.startShoot(targetQueueId);
        break;

      case "remind": {
        if (!targetQueueId) return NextResponse.json({ error: "queueId required" }, { status: 400 });
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
        if (!targetQueueId) return NextResponse.json({ error: "queueId required" }, { status: 400 });
        await db.finishShoot(targetQueueId);
        break;

      case "cancel":
        if (!targetQueueId) return NextResponse.json({ error: "queueId or guestToken required" }, { status: 400 });
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
          { status: 400 }
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
    console.error("Queue API Error:", error);
    const statusCode = error.statusCode || 500;
    return NextResponse.json(
      {
        error: error.message || "Failed to process queue action",
        details: error?.message || String(error),
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
