import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";
import { isLocalMode } from "@/lib/mode";

type Context = { params: Promise<{ path: string[] }> };

// Google is the only way in, so only these actions are passed on to Neon Auth.
const ALLOWED_POSTS = new Set(["sign-in/social", "sign-out"]);

const notFound = () => new NextResponse(null, { status: 404 });

export async function GET(request: NextRequest, context: Context) {
  if (isLocalMode) return notFound();
  return getAuth().handler().GET(request, context);
}

export async function POST(request: NextRequest, context: Context) {
  if (isLocalMode) return notFound();
  const { path } = await context.params;
  if (!ALLOWED_POSTS.has(path.join("/"))) return NextResponse.json({ error: "Use Google to sign in" }, { status: 403 });
  return getAuth().handler().POST(request, context);
}
