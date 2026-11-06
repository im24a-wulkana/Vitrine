"use client";

import { useCallback, useState } from "react";
import { attachCutout, discardUploads } from "@/lib/actions/items";
import { compressPhoto, queueCutout } from "@/lib/image-pipeline";
import { uploadPhotoBlob } from "@/lib/upload";

export type PhotoView = "cutout" | "original";

export interface Photo {
  key: string;
  itemId: string;
  preview: string;
  cutoutPreview?: string;
  /** Which version to display. Cutout until the user says otherwise; the original shows until one is ready. */
  view: PhotoView;
  originalUrl?: string;
  cutoutUrl?: string;
  originalFailed?: boolean;
  cutoutState: "pending" | "ready" | "failed";
  originalPromise: Promise<string>;
  cutoutPromise: Promise<string | null>;
}

export interface SavedImage {
  url: string;
  original_url: string;
  cutout_url: string | null;
}

function releasePreviews(photo: Photo) {
  URL.revokeObjectURL(photo.preview);
  if (photo.cutoutPreview) URL.revokeObjectURL(photo.cutoutPreview);
}

/** Compresses, uploads and cuts out each photo in the background, so the form stays usable. */
export function usePhotos() {
  const [photos, setPhotos] = useState<Photo[]>([]);

  const patch = useCallback((key: string, change: Partial<Photo>) => {
    setPhotos((all) => all.map((p) => (p.key === key ? { ...p, ...change } : p)));
  }, []);

  const add = useCallback(
    (files: File[], itemIdFor: () => string) => {
      const next = files.map((file): Photo => {
        const key = crypto.randomUUID();
        const itemId = itemIdFor();
        const compressed = compressPhoto(file);

        const originalPromise = compressed.then((blob) => uploadPhotoBlob(blob));
        originalPromise.then(
          (originalUrl) => patch(key, { originalUrl }),
          () => patch(key, { originalFailed: true }),
        );

        const cutoutPromise = compressed
          .then(queueCutout)
          .then(async (blob) => {
            patch(key, { cutoutPreview: URL.createObjectURL(blob) });
            const cutoutUrl = await uploadPhotoBlob(blob);
            patch(key, { cutoutUrl, cutoutState: "ready" });
            return cutoutUrl;
          })
          .catch(() => {
            patch(key, { cutoutState: "failed" });
            return null;
          });

        return { key, itemId, preview: URL.createObjectURL(file), view: "cutout", cutoutState: "pending", originalPromise, cutoutPromise };
      });
      setPhotos((all) => [...all, ...next]);
      return next;
    },
    [patch],
  );

  const setView = useCallback((key: string, view: PhotoView) => patch(key, { view }), [patch]);

  const remove = useCallback((photo: Photo) => {
    setPhotos((all) => all.filter((p) => p.key !== photo.key));
    releasePreviews(photo);
    // Wait for uploads in progress, so a removed photo doesn't leave files behind.
    Promise.allSettled([photo.originalPromise, photo.cutoutPromise]).then((results) => {
      const urls = results.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
      if (urls.length) discardUploads(urls);
    });
  }, []);

  const clear = useCallback(() => {
    setPhotos((all) => {
      all.forEach(releasePreviews);
      return [];
    });
  }, []);

  return { photos, add, setView, remove, clear };
}

/** Waits for the originals only. A slow cutout must never hold up saving an item. */
export async function imagesForSave(photos: Photo[]): Promise<{ images: SavedImage[]; failed: number }> {
  const settled = await Promise.allSettled(photos.map((p) => p.originalPromise));
  const images: SavedImage[] = [];
  settled.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    const cutoutUrl = photos[i].cutoutUrl ?? null;
    images.push({
      url: cutoutUrl && photos[i].view === "cutout" ? cutoutUrl : result.value,
      original_url: result.value,
      cutout_url: cutoutUrl,
    });
  });
  return { images, failed: settled.length - images.length };
}

/** Cutouts still running when the item was saved attach themselves when they finish. */
export function attachPendingCutouts(photos: Photo[]) {
  for (const photo of photos) {
    if (photo.cutoutState !== "pending") continue;
    Promise.all([photo.originalPromise, photo.cutoutPromise])
      .then(([originalUrl, cutoutUrl]) => {
        if (cutoutUrl) return attachCutout(photo.itemId, originalUrl, cutoutUrl, photo.view === "cutout");
      })
      .catch(() => {
        // The original is saved. The cutout can be made again from the edit page.
      });
  }
}
