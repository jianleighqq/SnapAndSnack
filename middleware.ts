import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 1. Static assets & Next.js internals are always public
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/favicon.ico" ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/)
  ) {
    return NextResponse.next();
  }

  // 2. Explicit public routes (never require PIN)
  if (
    pathname === "/" ||
    pathname === "/booth" ||
    pathname === "/booth/shoot" ||
    pathname === "/login" ||
    pathname.startsWith("/guest") ||
    pathname.startsWith("/gallery") ||
    pathname.startsWith("/api/guest") ||
    pathname.startsWith("/api/gallery") ||
    pathname.startsWith("/api/intake") ||
    pathname.startsWith("/api/booth")
  ) {
    return NextResponse.next();
  }

  // 3. Determine if the path is a protected page or protected API route
  const isProtectedPage = pathname.startsWith("/admin");

  const isProtectedApi =
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/events") ||
    pathname.startsWith("/api/queue") ||
    pathname.startsWith("/api/session") ||
    pathname.startsWith("/api/print") ||
    pathname.startsWith("/api/hardware") ||
    pathname.startsWith("/api/templates") ||
    pathname.startsWith("/api/media");

  // If path is neither a protected page nor a protected API, let it proceed
  if (!isProtectedPage && !isProtectedApi) {
    return NextResponse.next();
  }

  // 4. Verify the signed session cookie without any database calls
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessionSecret = process.env.SESSION_SECRET;

  const validSession = await verifySessionToken(sessionCookie, sessionSecret);

  if (validSession) {
    return NextResponse.next();
  }

  // 5. Unauthorized handling:
  // API routes return 401 JSON; Page routes redirect to /login with return URL
  if (isProtectedApi) {
    return NextResponse.json(
      { error: "Unauthorized: Operator session required" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const loginUrl = new URL("/login", request.url);
  const target = pathname + search;
  loginUrl.searchParams.set("from", target);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files with extensions
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

