import { isLocalMode } from "@/lib/mode";
import { createClient } from "@/lib/supabase/client";

const MAX_EDGE = 1600;

/**
 * Shrinks a camera photo before upload: a 5 MB phone photo becomes a few hundred
 * KB, which matters on mobile data. Formats the browser cannot decode (HEIC
 * outside Safari, for example) are uploaded unchanged.
 */
async function compress(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Uploads to <user>/<item>/<random> and returns the public URL. */
export async function uploadItemPhoto(file: File, itemId: string): Promise<string> {
  if (isLocalMode) {
    const form = new FormData();
    form.append("file", await compress(file));
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

  const blob = await compress(file);
  const ext = blob.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() ?? "img").toLowerCase();
  const path = `${user.id}/${itemId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from("item-images").upload(path, blob, {
    contentType: blob.type || file.type,
    cacheControl: "31536000",
  });
  if (error) throw new Error(error.message);
  return supabase.storage.from("item-images").getPublicUrl(path).data.publicUrl;
}
