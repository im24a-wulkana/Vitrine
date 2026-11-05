// Server only. Photos are private: a stored URL points at this app's own route,
// which checks who's asking. Vercel Blob when deployed, this computer otherwise.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { del, get, put } from "@vercel/blob";
import { LOCAL_UPLOAD_DIR } from "@/lib/local/paths";

export const PHOTO_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export const PHOTO_TYPES: Record<string, string> = Object.fromEntries(Object.entries(PHOTO_EXTENSIONS).map(([type, ext]) => [ext, type]));

const usesBlob = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL);
const PREFIX = "/api/photos/";
const NAME = /^[0-9a-f-]{36}\.(jpg|png|webp|heic|heif)$/;

/** Only names this app generated can match, which also rules out path traversal. */
export function isPhotoName(name: string): boolean {
  return NAME.test(name);
}

export async function savePhoto(userId: string, file: Blob): Promise<string> {
  const extension = PHOTO_EXTENSIONS[file.type];
  if (!extension) throw new Error("Unsupported image type");
  const name = `${randomUUID()}.${extension}`;
  const path = `${userId}/${name}`;

  if (usesBlob()) {
    await put(path, file, { access: "private", contentType: file.type, addRandomSuffix: false });
  } else {
    mkdirSync(join(/*turbopackIgnore: true*/ LOCAL_UPLOAD_DIR, userId), { recursive: true });
    writeFileSync(join(/*turbopackIgnore: true*/ LOCAL_UPLOAD_DIR, userId, name), Buffer.from(await file.arrayBuffer()));
  }
  return PREFIX + path;
}

export async function readPhoto(userId: string, name: string): Promise<BodyInit | null> {
  if (!isPhotoName(name)) return null;
  if (usesBlob()) {
    const result = await get(`${userId}/${name}`, { access: "private" });
    return result?.statusCode === 200 ? result.stream : null;
  }
  const path = join(/*turbopackIgnore: true*/ LOCAL_UPLOAD_DIR, userId, name);
  return existsSync(path) ? new Uint8Array(readFileSync(path)) : null;
}

/** The storage path of a photo this user owns, or null. Other people's URLs never resolve. */
export function ownedPhotoPath(userId: string, url: string): string | null {
  if (!url.startsWith(`${PREFIX}${userId}/`)) return null;
  const name = url.slice(`${PREFIX}${userId}/`.length);
  return isPhotoName(name) ? `${userId}/${name}` : null;
}

/** Deletes files. Anything that isn't this user's own photo is ignored. */
export async function removePhotos(userId: string, urls: (string | null | undefined)[]): Promise<void> {
  const wanted = [...new Set(urls.filter((u): u is string => !!u))];
  const paths = wanted.map((url) => ownedPhotoPath(userId, url)).filter((p): p is string => p !== null);

  if (paths.length) {
    if (usesBlob()) await del(paths);
    else for (const path of paths) rmSync(join(/*turbopackIgnore: true*/ LOCAL_UPLOAD_DIR, path), { force: true });
  }

  // Photos added in local mode before this route existed.
  if (!usesBlob()) {
    for (const url of wanted) {
      if (url.startsWith("/api/local-files/")) rmSync(join(/*turbopackIgnore: true*/ LOCAL_UPLOAD_DIR, basename(url)), { force: true });
    }
  }
}
