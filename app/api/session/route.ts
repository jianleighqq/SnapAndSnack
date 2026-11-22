import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOperatorSession } from "@/lib/auth-server";
import { getCurrentBoothGuest } from "@/lib/booth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    const { queueId, captureType } = body;

    if (!queueId) {
      return NextResponse.json({ error: "queueId is required" }, { status: 400 });
    }

    const session = await db.getOrCreateShootSession(queueId, captureType || "PHOTO");

    return NextResponse.json({ session });
  } catch (error: any) {
    console.error("POST /api/session error:", error);
    return NextResponse.json(
      { error: "Failed to initialize shoot session" },
      { status: 500 }
    );
  }
}

