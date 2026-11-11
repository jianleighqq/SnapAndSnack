import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const guestId = searchParams.get("guestId");

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
      { error: error?.message || "Failed to check print count" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { guestId, eventId, mediaId, status } = body;

    if (!guestId) {
      return NextResponse.json({ error: "guestId is required" }, { status: 400 });
    }

    const currentEvent = await db.getActiveEvent();
    const maxAllowed = currentEvent?.max_prints_per_guest ?? 1;
    const currentCount = await db.countPrints(guestId);

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
      guestId,
      eventId,
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
      { error: error?.message || "Failed to record print job" },
      { status: 500 }
    );
  }
}

