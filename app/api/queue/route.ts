import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const { event, queue } = await db.getActiveEventWithQueue();
    return NextResponse.json(
      { event, queue },
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

      case "remind":
        if (!targetQueueId) return NextResponse.json({ error: "queueId required" }, { status: 400 });
        await db.remindGuest(targetQueueId);
        break;

      case "finish":
        if (!targetQueueId) return NextResponse.json({ error: "queueId required" }, { status: 400 });
        await db.finishShoot(targetQueueId);
        break;

      case "cancel":
        if (!targetQueueId) return NextResponse.json({ error: "queueId or guestToken required" }, { status: 400 });
        await db.cancelBooking(targetQueueId);
        break;

      case "callNext":
        await db.callNext();
        break;

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    const { event, queue } = await db.getActiveEventWithQueue();
    return NextResponse.json(
      {
        success: true,
        event,
        queue,
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
