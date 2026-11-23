import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./auth";

/**
 * Server-side operator session validator.
 * Checks the signed session cookie in both the incoming request headers and Next.js cookies().
 * Returns true if the session is authentic, unexpired, and carries the "operator" role.
 */
export async function requireOperatorSession(request?: Request): Promise<boolean> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;

  let token: string | undefined;

  // 1. Check direct Request cookie header
  if (request) {
    const cookieHeader = request.headers.get("cookie") || "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
    if (match) {
      try {
        token = decodeURIComponent(match[1]);
      } catch {
        token = match[1];
      }
    }
  }

  // 2. Fall back to Next.js cookies() API
  if (!token) {
    try {
      token = cookies().get(SESSION_COOKIE_NAME)?.value;
    } catch {
      // In some route handler contexts cookies() might not be available
    }
  }

  if (!token) return false;

  const payload = await verifySessionToken(token, secret);
  return Boolean(payload && payload.role === "operator");
}
