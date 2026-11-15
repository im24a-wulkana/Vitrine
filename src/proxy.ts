import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";
import { DEMO_COOKIE } from "@/lib/demo";
import { isLocalMode } from "@/lib/mode";

// The scheduled job has its own secret, checked in the route.
const PUBLIC_ROUTES = ["/login", "/offline", "/demo", "/api/push/check"];

type Guard = ReturnType<ReturnType<typeof getAuth>["middleware"]>;
let guard: Guard | null = null;

export default async function proxy(request: NextRequest) {
  if (isLocalMode) {
    if (request.nextUrl.pathname !== "/login") return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/closet";
    url.search = "";
    return NextResponse.redirect(url);
  }

  guard ??= getAuth().middleware({ loginUrl: "/login", publicRoutes: PUBLIC_ROUTES });
  const response = await guard(request);
  // Anyone in the demo is let through where they'd otherwise be sent to sign in.
  // The pages then run them as the read-only demo account.
  if (request.cookies.has(DEMO_COOKIE) && response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location && new URL(location, request.url).pathname === "/login") return NextResponse.next();
  }
  return response;
}

export const config = {
  // Skip static assets and PWA files, which must load without a session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|robots.txt|icons/|placeholders/).*)"],
};
