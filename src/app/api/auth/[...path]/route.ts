import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";
import { isLocalMode } from "@/lib/mode";

type Context = { params: Promise<{ path: string[] }> };

const notFound = () => new NextResponse(null, { status: 404 });

export async function GET(request: NextRequest, context: Context) {
  if (isLocalMode) return notFound();
  return getAuth().handler().GET(request, context);
}

/**
 * Accounts are created by the add-user script, so this app won't pass sign-ups on.
 * This doesn't close Neon Auth's own public sign-up URL: a login made there still
 * can't get in, because of the check in findAllowedUser.
 */
export async function POST(request: NextRequest, context: Context) {
  if (isLocalMode) return notFound();
  const { path } = await context.params;
  if (path[0] === "sign-up") return NextResponse.json({ error: "Sign-up is closed" }, { status: 403 });
  return getAuth().handler().POST(request, context);
}
