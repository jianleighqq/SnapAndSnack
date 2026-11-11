import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/lib/auth";
import {
  getClientIp,
  checkLoginRateLimit,
  recordLoginFailure,
  resetLoginAttempts,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const clientIp = getClientIp(request);

  // 1. Check rate limit before evaluating PIN
  const rateStatus = checkLoginRateLimit(clientIp);
  if (!rateStatus.allowed) {
    const minutesLeft = Math.ceil((rateStatus.resetAt - Date.now()) / 60_000);
    return NextResponse.json(
      {
        error: `Too many failed attempts. Please try again in ${Math.max(1, minutesLeft)} minute${minutesLeft === 1 ? "" : "s"}.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateStatus.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { pin } = body;

    const operatorPin = process.env.OPERATOR_PIN;
    const sessionSecret = process.env.SESSION_SECRET;

    if (!operatorPin || !sessionSecret) {
      console.error("[Auth API] OPERATOR_PIN or SESSION_SECRET is not configured in server environment");
      return NextResponse.json(
        { error: "Server authentication is not properly configured" },
        { status: 500 }
      );
    }

    if (!pin || typeof pin !== "string") {
      return NextResponse.json(
        { error: "PIN is required" },
        { status: 400 }
      );
    }

    // 2. Constant-time PIN verification using crypto.timingSafeEqual
    const inputBuffer = Buffer.from(pin.trim());
    const expectedBuffer = Buffer.from(operatorPin.trim());
    const isValid =
      inputBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(inputBuffer, expectedBuffer);

    if (!isValid) {
      const failureStatus = recordLoginFailure(clientIp);
      console.warn(`[Auth API] Failed PIN attempt from IP ${clientIp}. Remaining: ${failureStatus.remaining}`);

      if (!failureStatus.allowed) {
        return NextResponse.json(
          {
            error: "Too many failed attempts. Please try again in 10 minutes.",
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        {
          error: "Incorrect PIN. Please try again.",
          remainingAttempts: failureStatus.remaining,
        },
        { status: 401 }
      );
    }

    // 3. Successful authentication: reset failed attempts
    resetLoginAttempts(clientIp);

    // 4. Create signed session token
    const token = await createSessionToken(sessionSecret);

    // 5. Set httpOnly, secure (in prod), sameSite=lax cookie
    const response = NextResponse.json({ success: true });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    });

    return response;
  } catch (err: any) {
    console.error("[Auth API] Login exception:", err);
    return NextResponse.json(
      { error: "Internal authentication error" },
      { status: 500 }
    );
  }
}
