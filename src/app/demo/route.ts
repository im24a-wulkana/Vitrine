import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/lib/demo";
import { isLocalMode } from "@/lib/mode";

/** Opens the read-only demo. Signing in, or signing out of the demo, ends it. */
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/closet", request.url));
  if (!isLocalMode) {
    response.cookies.set(DEMO_COOKIE, "1", {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  return response;
}
