import { NextResponse } from "next/server";
import { validateBoothSession, SESSION_GRACE_WINDOW_MS } from "@/lib/booth";
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
    const body = await request.json().catch(() => ({}));
    const { sessionId } = body || {};

    const auth = await validateBoothSession(sessionId);
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status, headers: { "Cache-Control": "no-store" } }
      );
    }
    const context = auth.context;

    // Idempotent completion: if already finished or completed, return success
    if (context.queueEntry.status === "COMPLETED") {
      return NextResponse.json(
        {
          success: true,
          finished: null,
          alreadyFinished: true,
        },
        {
          headers: {
            "Cache-Control": "no-store",
            "X-RateLimit-Remaining": String(rateLimit.remaining),
          },
        }
      );
    }

    const result = await db.finishShoot(context.queueEntry.id);

    return NextResponse.json(
      {
        success: true,
        finished: result.finished,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  } catch (error: any) {
    console.error("[Booth Finish] Error finishing shoot:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

