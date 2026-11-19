import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
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
      { error: error?.message || "Failed to initialize shoot session" },
      { status: 500 }
    );
  }
}

