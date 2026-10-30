import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [event, queue] = await Promise.all([
      db.getCurrentEvent(),
      db.getQueue(),
    ]);
    return NextResponse.json({ event, queue });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch queue data" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, queueId, guestToken } = body;

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

    let result;
    switch (action) {
      case "start":
        if (!targetQueueId) return NextResponse.json({ error: "queueId required" }, { status: 400 });
        result = await db.startShoot(targetQueueId);
        break;

      case "remind":
        if (!targetQueueId) return NextResponse.json({ error: "queueId required" }, { status: 400 });
        result = await db.remindGuest(targetQueueId);
        break;

      case "finish":
        if (!targetQueueId) return NextResponse.json({ error: "queueId required" }, { status: 400 });
        result = await db.finishShoot(targetQueueId);
        break;

      case "cancel":
        if (!targetQueueId) return NextResponse.json({ error: "queueId or guestToken required" }, { status: 400 });
        result = await db.cancelBooking(targetQueueId);
        break;

      case "callNext":
        result = await db.callNext();
        break;

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("Queue API Error:", error);
    return NextResponse.json(
      { error: "Failed to process queue action", details: error?.message || String(error) },
      { status: 500 }
    );
  }
}
