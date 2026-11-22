import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOperatorSession } from "@/lib/auth-server";
import { getCurrentBoothGuest } from "@/lib/booth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const isOperator = await requireOperatorSession(request);
    const boothContext = !isOperator ? await getCurrentBoothGuest() : null;

    if (!isOperator && !boothContext) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { searchParams } = new URL(request.url);
    const guestId = searchParams.get("guestId") || boothContext?.guest.id;

    if (!guestId) {
      return NextResponse.json({ error: "guestId is required" }, { status: 400 });
    }

    const currentEvent = await db.getActiveEvent();
    const maxAllowed = currentEvent?.max_prints_per_guest ?? 1;
    const count = await db.countPrints(guestId);

    return NextResponse.json({
      guestId,
      count,
      maxAllowed,
      canPrint: count < maxAllowed,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to check print count" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const isOperator = await requireOperatorSession(request);
    const boothContext = !isOperator ? await getCurrentBoothGuest() : null;

    if (!isOperator && !boothContext) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const body = await request.json();
    const { guestId, eventId, mediaId, status } = body;

    const effectiveGuestId = guestId || boothContext?.guest.id;
    const effectiveEventId = eventId || boothContext?.event.id;

    if (!effectiveGuestId) {
      return NextResponse.json({ error: "guestId is required" }, { status: 400 });
    }

    const currentEvent = await db.getActiveEvent();
    const maxAllowed = currentEvent?.max_prints_per_guest ?? 1;
    const currentCount = await db.countPrints(effectiveGuestId);

    // If attempting to print or record PRINTED and limit already reached, return 409
    if (status !== "FAILED" && currentCount >= maxAllowed) {
      return NextResponse.json(
        {
          error: "You have used your print",
          count: currentCount,
          maxAllowed,
          canPrint: false,
        },
        { status: 409 }
      );
    }

    const result = await db.recordPrint({
      guestId: effectiveGuestId,
      eventId: effectiveEventId,
      mediaId,
      status: status || "PRINTED",
    });

    if (!result.allowed && result.message === "You have used your print") {
      return NextResponse.json(
        {
          error: "You have used your print",
          count: result.count,
          maxAllowed,
          canPrint: false,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to record print job" },
      { status: 500 }
    );
  }
}

