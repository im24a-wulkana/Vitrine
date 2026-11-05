import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/session";
import { isPhotoName, PHOTO_TYPES, readPhoto } from "@/lib/storage";

const notFound = () => new NextResponse(null, { status: 404 });

/** Serves a photo to its owner only. Everyone else gets the same answer as for a photo that doesn't exist. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ owner: string; name: string }> }) {
  const { owner, name } = await params;
  const { user } = await getUser();
  if (!user || user.id !== owner || !isPhotoName(name)) return notFound();

  const body = await readPhoto(owner, name).catch(() => null);
  if (!body) return notFound();

  return new NextResponse(body, {
    headers: {
      "Content-Type": PHOTO_TYPES[name.split(".").pop() as string],
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
