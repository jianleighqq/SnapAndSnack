import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 404 });
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
