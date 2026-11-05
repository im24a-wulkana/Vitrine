import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/session";
import { PHOTO_EXTENSIONS, savePhoto } from "@/lib/storage";

// Vercel rejects request bodies over 4.5 MB before they reach this route.
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const { user } = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const file = (await request.formData()).get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!PHOTO_EXTENSIONS[file.type]) return NextResponse.json({ error: "Unsupported image type" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is larger than 4 MB" }, { status: 413 });

  try {
    return NextResponse.json({ url: await savePhoto(user.id, file) });
  } catch {
    return NextResponse.json({ error: "Couldn't store the photo" }, { status: 502 });
  }
}
