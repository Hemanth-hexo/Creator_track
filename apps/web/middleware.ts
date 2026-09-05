import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // /api/* is proxied straight through to the real API (see next.config.mjs)
  // which has its own, independent auth — this page-level gate must never
  // intercept it, or the login request itself would get redirected instead
  // of reaching the API.
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith("/_next") || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // The API sets this cookie as host-only (no explicit Domain), so it's visible
  // to this app on the same hostname regardless of port. We only check
  // presence here — the API independently verifies the signature on every
  // request; this is just a UX redirect, not the security boundary.
  const hasSession = request.cookies.has("session");
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
