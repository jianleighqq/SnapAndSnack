import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      // In development/preview mode, if no token is provided, return the first active waiting guest
      const queue = await db.getQueue();
      const firstEntry = queue.find((q) => q.status === "WAITING" || q.status === "REMINDED" || q.status === "IN_PROGRESS") || queue[0];
      if (firstEntry) {
        const guestData = await db.getGuestByToken(firstEntry.guest.guest_token);
        return NextResponse.json({ ...guestData, isSample: true });
      }
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const guestData = await db.getGuestByToken(token);
    if (!guestData) {
      return NextResponse.json({ error: "Guest not found" }, { status: 404 });
    }

    return NextResponse.json(guestData);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch guest status" },
      { status: 500 }
    );
  }
}
