import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { STAFF_NAV } from "@/lib/auth/nav";

const SESSION_COOKIE = "libraryhub_session";

const STAFF_PATHS = new Set(STAFF_NAV.map((item) => item.href));

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  if (
    STAFF_PATHS.has(pathname) &&
    !request.cookies.get(SESSION_COOKIE)?.value
  ) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [...STAFF_NAV.map((item) => item.href), "/login"],
};