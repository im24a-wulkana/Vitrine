import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { LOCAL_UPLOAD_DIR } from "@/lib/local/paths";
import { isLocalMode } from "@/lib/mode";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};
const MAX_BYTES = 10 * 1024 * 1024;

/** Local mode only: stores a photo on this computer, in place of Supabase Storage. */
export async function POST(request: NextRequest) {
  if (!isLocalMode) return new NextResponse(null, { status: 404 });

  const file = (await request.formData()).get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "No file" }, { status: 400 });
  const extension = EXTENSIONS[file.type];
  if (!extension) return NextResponse.json({ error: "Unsupported image type" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is larger than 10 MB" }, { status: 413 });

  mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
  const name = `${randomUUID()}.${extension}`;
  writeFileSync(join(LOCAL_UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ url: `/api/local-files/${name}` });
}
