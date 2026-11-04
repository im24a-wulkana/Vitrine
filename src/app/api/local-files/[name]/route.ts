import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { LOCAL_UPLOAD_DIR } from "@/lib/local/paths";
import { isLocalMode } from "@/lib/mode";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  // Only names this app generated can match, which also rules out path traversal.
  const match = name.match(/^[a-f0-9-]{36}\.(jpg|png|webp|heic|heif)$/);
  if (!isLocalMode || !match) return new NextResponse(null, { status: 404 });

  const path = join(LOCAL_UPLOAD_DIR, name);
  if (!existsSync(path)) return new NextResponse(null, { status: 404 });
  return new NextResponse(readFileSync(path), {
    headers: { "Content-Type": TYPES[match[1]], "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
