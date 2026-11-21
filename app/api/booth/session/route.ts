import { NextResponse } from "next/server";
import { getCurrentBoothGuest } from "@/lib/booth";
import { checkBoothRateLimit, getClientIp } from "@/lib/rate-limit";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rateLimit = checkBoothRateLimit(ip);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const context = await getCurrentBoothGuest();
    if (!context) {
      return NextResponse.json(
        { error: "No guest is currently in progress" },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    let captureType = "PHOTO";
    let templateId: string | null | undefined = undefined;
    try {
      const body = await request.json();
      if (body && typeof body.captureType === "string") {
        captureType = body.captureType;
      }
      if (body && (typeof body.templateId === "string" || body.templateId === null)) {
        templateId = body.templateId;
      }
    } catch {}

    const session = await db.getOrCreateShootSession(
      context.queueEntry.id,
      captureType,
      templateId
    );

    return NextResponse.json(
      { success: true, session },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  } catch (error: any) {
    console.error("[Booth API] Error creating/fetching shoot session:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function PATCH(request: Request) {
  const ip = getClientIp(request);
  const rateLimit = checkBoothRateLimit(ip);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const body = await request.json();
    const { sessionId, templateId } = body || {};

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const success = await db.updateShootSessionTemplate(sessionId, templateId || null);

    return NextResponse.json(
      { success, templateId },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  } catch (error: any) {
    console.error("[Booth API] Error updating shoot session template:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

