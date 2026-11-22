import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkGuestHasPush } from "@/lib/push";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const queueId = url.searchParams.get("queueId");

    if (!queueId || typeof queueId !== "string" || !queueId.trim()) {
      return NextResponse.json(
        { error: "queueId query parameter is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const guestToken = await db.getGuestTokenByQueueId(queueId.trim());

    if (!guestToken) {
      return NextResponse.json(
        { error: "Guest or ticket token not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const guestData = await db.getGuestByToken(guestToken);
    const hasAlerts = guestData?.guest?.id
      ? await checkGuestHasPush(guestData.guest.id)
      : false;

    const rawBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const baseUrl = rawBaseUrl.replace(/\/$/, "");
    const ticketUrl = `${baseUrl}/guest?token=${encodeURIComponent(guestToken)}`;

    return NextResponse.json(
      {
        success: true,
        ticketUrl,
        guestToken,
        hasAlerts,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("GET /api/admin/queue/ticket error:", error);
    return NextResponse.json(
      { error: "Failed to generate ticket URL" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
