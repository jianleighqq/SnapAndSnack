import { NextResponse } from "next/server";
import { getCurrentBoothGuest } from "@/lib/booth";
import { checkBoothRateLimit, getClientIp } from "@/lib/rate-limit";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
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

    const count = await db.countPrints(context.guest.id);
    const maxPrints = context.event.max_prints_per_guest ?? 1;
    const canPrint = count < maxPrints;

    return NextResponse.json(
      {
        canPrint,
        count,
        maxPrints,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  } catch (error: any) {
    console.error("[Booth Print] Error checking print limit:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

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

    const body = await request.json().catch(() => ({}));
    const { mediaId, status = "PRINTED" } = body || {};

    const maxPrints = context.event.max_prints_per_guest ?? 1;
    const currentCount = await db.countPrints(context.guest.id);

    // If attempting to print when limit is already reached
    if (status === "PRINTED" && currentCount >= maxPrints) {
      return NextResponse.json(
        {
          error: "Print limit reached for this session",
          canPrint: false,
          count: currentCount,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    const result = await db.recordPrint({
      guestId: context.guest.id,
      eventId: context.event.id,
      mediaId,
      status: status === "FAILED" ? "FAILED" : "PRINTED",
    });

    return NextResponse.json(
      {
        success: result.success,
        count: result.count,
        allowed: result.allowed,
        message: result.message,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  } catch (error: any) {
    console.error("[Booth Print] Error recording print:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

