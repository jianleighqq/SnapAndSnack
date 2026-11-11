import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { db } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  // 1. Rate limiting: 60 requests per minute per IP
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(clientIp, 60, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { token } = body;

    if (!token || typeof token !== "string" || !token.trim()) {
      return NextResponse.json(
        { error: "Booking token is required" },
        { status: 400 }
      );
    }

    const cleanToken = token.trim();

    // 2. Find guest by token
    const { data: guest, error: gErr } = await supabaseServer
      .from("guests")
      .select("id")
      .eq("guest_token", cleanToken)
      .maybeSingle();

    if (gErr || !guest) {
      return NextResponse.json(
        { error: "Booking link not found" },
        { status: 404 }
      );
    }

    // 3. Find latest queue entry for this guest
    const { data: queueRows, error: qErr } = await supabaseServer
      .from("queue_entries")
      .select("id, status")
      .eq("guest_id", guest.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (qErr || !queueRows || queueRows.length === 0) {
      return NextResponse.json(
        { error: "Queue entry not found" },
        { status: 404 }
      );
    }

    const queueEntry = queueRows[0];

    // 4. Reject cancellation for IN_PROGRESS or COMPLETED (409)
    if (queueEntry.status === "IN_PROGRESS" || queueEntry.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Cannot cancel booking once shooting has started or completed." },
        { status: 409 }
      );
    }

    // If already cancelled, return success idempotently
    if (queueEntry.status === "CANCELLED") {
      return NextResponse.json({
        success: true,
        message: "Your booking is cancelled.",
        status: "CANCELLED",
      });
    }

    // 5. Cancel booking via db.cancelBooking (sets CANCELLED and runs refreshStatuses)
    await db.cancelBooking(queueEntry.id);

    return NextResponse.json({
      success: true,
      message: "Your booking was cancelled.",
      status: "CANCELLED",
    });
  } catch (error: any) {
    console.error("POST /api/guest/cancel error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to cancel booking" },
      { status: 500 }
    );
  }
}

