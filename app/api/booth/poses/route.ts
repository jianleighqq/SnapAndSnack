import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { checkBoothRateLimit, getClientIp } from "@/lib/rate-limit";
import { seedPosesIfEmpty, attachSignedPoseUrl } from "@/lib/poses";
import type { Pose } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/booth/poses
 *
 * Public endpoint for the Shoot Console on the booth.
 * - Rate limited (max 120 requests/minute per client IP)
 * - Returns only active poses (is_active = true) ordered by sort_order
 * - Attaches fresh 1-hour signed URLs for guide pictures
 * - Cache-Control: no-store
 */
export async function GET(request: Request) {
  // 1. Rate limiting check
  const ip = getClientIp(request);
  const rateLimit = checkBoothRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    // Ensure default poses are seeded if table is empty
    await seedPosesIfEmpty();

    const { data: poses, error } = await supabaseServer
      .from("poses")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[Booth Poses API] Error fetching active poses:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Attach signed URLs for each active pose with an image
    const posesWithUrls: Pose[] = await Promise.all(
      (poses || []).map(attachSignedPoseUrl)
    );

    return NextResponse.json(
      { poses: posesWithUrls },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  } catch (err: any) {
    console.error("[Booth Poses API] Exception:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
