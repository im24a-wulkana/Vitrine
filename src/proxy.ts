import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";
import { isLocalMode } from "@/lib/mode";

// The scheduled job has its own secret, checked in the route.
const PUBLIC_ROUTES = ["/login", "/offline", "/api/push/check"];

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
  return guard(request);
}

export const config = {
  // Skip static assets and PWA files, which must load without a session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|robots.txt|icons/|placeholders/).*)"],
};
