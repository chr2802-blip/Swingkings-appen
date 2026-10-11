import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * A cheap cookie-presence gate so an unauthenticated request never reaches a page
 * render. The cookie is actually verified in `getCurrentUser`, which every page calls.
 */
export function middleware(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/oversigt/:path*",
    "/boder/:path*",
    "/kampe/:path*",
    "/opgaver/:path*",
    "/feed/:path*",
    "/chat/:path*",
    "/hold/:path*",
    "/profil/:path*",
    "/admin/:path*",
  ],
};
