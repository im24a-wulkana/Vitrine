import { NextResponse, type NextRequest } from "next/server";
import { AiError, getVisionProvider, type VisionImage } from "@/lib/ai/providers";
import { getUser } from "@/lib/supabase/server";

const TYPES = new Set<string>(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 5 * 1024 * 1024;

/** Takes one downsized photo, sends it to the vision provider, and returns suggested tags. */
export async function POST(request: NextRequest) {
  const { user } = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const provider = getVisionProvider();
  if (!provider) return NextResponse.json({ error: "AI isn't set up" }, { status: 503 });

  const file = (await request.formData()).get("image");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "No image" }, { status: 400 });
  if (!TYPES.has(file.type)) return NextResponse.json({ error: "Unsupported image type" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is too large" }, { status: 413 });

  try {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const tags = await provider.tagItem({ data, mediaType: file.type as VisionImage["mediaType"] });
    return NextResponse.json({ tags });
  } catch (error) {
    const message = error instanceof AiError ? error.message : "The AI request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
