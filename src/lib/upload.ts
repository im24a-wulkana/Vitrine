import { isLocalMode } from "@/lib/mode";
import { createClient } from "@/lib/supabase/client";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** Stores a finished image and returns its URL. Compress or cut out before calling this. */
export async function uploadPhotoBlob(blob: Blob, itemId: string): Promise<string> {
  if (isLocalMode) {
    const form = new FormData();
    form.append("file", blob);
    const res = await fetch("/api/local-files", { method: "POST", body: form });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Upload failed");
    return body.url;
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const path = `${user.id}/${itemId}/${crypto.randomUUID()}.${EXTENSIONS[blob.type] ?? "jpg"}`;
  const { error } = await supabase.storage.from("item-images").upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    cacheControl: "31536000",
  });
  if (error) throw new Error(error.message);
  return supabase.storage.from("item-images").getPublicUrl(path).data.publicUrl;
}
