import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    // Return 404 if token parameter is missing or empty; never return the first guest
    if (!token || !token.trim()) {
      return NextResponse.json(
        { error: "Valid guest token is required" },
        { status: 404 }
      );
    }

    const guestData = await db.getGuestByToken(token.trim());
    if (!guestData) {
      return NextResponse.json(
        { error: "Guest not found" },
        { status: 404 }
      );
    }

    const { guest, queueEntry, positionInLine } = guestData;
    const guestsAhead = positionInLine !== null ? Math.max(0, positionInLine - 1) : 0;

    return NextResponse.json({
      name: guest.full_name,
      queue_number: queueEntry?.queue_number ?? null,
      status: queueEntry?.status ?? null,
      guests_ahead: guestsAhead,
      estimated_time: queueEntry?.scheduled_shoot_time ?? null,
      // Retain guest and queueEntry object properties for view components
      guest,
      queueEntry,
      positionInLine,
    });
  } catch (error) {
    console.error("API /api/guest error:", error);
    return NextResponse.json(
      { error: "Failed to fetch guest status" },
      { status: 500 }
    );
  }
}
