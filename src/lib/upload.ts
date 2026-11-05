/** Stores a finished image and returns its URL. Compress or cut out before calling this. */
export async function uploadPhotoBlob(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", blob);
  const res = await fetch("/api/photos", { method: "POST", body: form });
  // A size rejection from the host isn't JSON.
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.url) throw new Error(body?.error ?? (res.status === 413 ? "Image is larger than 4 MB" : "Upload failed"));
  return body.url;
}
