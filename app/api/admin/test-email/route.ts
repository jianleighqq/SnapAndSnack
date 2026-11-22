import { NextResponse } from "next/server";
import { sendTestEmail } from "@/lib/email";
import { requireOperatorSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const isAuthorized = await requireOperatorSession(request);
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Unauthorized. Operator session required." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { email, eventName } = body || {};

    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "A valid recipient email address is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const result = await sendTestEmail(normalizedEmail, eventName);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send email. Check server logs." },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        success: true,
        provider: result.provider,
        messageId: result.messageId,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    console.error("Test email API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
