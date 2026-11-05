"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Loader2, Star, X } from "lucide-react";
import { CutoutProgress, ViewToggle } from "@/components/photo-tile";
import { Button } from "@/components/ui/button";
import { addImage, attachCutout, removeImage, setImageVersion, setPrimaryImage } from "@/lib/actions/items";
import { imageFitClass } from "@/lib/format";
import { compressPhoto, queueCutout } from "@/lib/image-pipeline";
import type { ItemImage } from "@/lib/types";
import { uploadPhotoBlob } from "@/lib/upload";

export function PhotoManager({ itemId, images }: { itemId: string; images: ItemImage[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [cutting, setCutting] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const sorted = [...images].sort((a, b) => a.position - b.position);

  async function makeCutout(originalUrl: string, photo: Blob) {
    setCutting((s) => new Set(s).add(originalUrl));
    try {
      const cutoutUrl = await uploadPhotoBlob(await queueCutout(photo));
      const res = await attachCutout(itemId, originalUrl, cutoutUrl, true);
      if (!res.ok) setError(res.error);
    } catch {
      setError("The cutout failed. The original photo is safe, and you can try again.");
    } finally {
      setCutting((s) => {
        const next = new Set(s);
        next.delete(originalUrl);
        return next;
      });
    }
  }

  function upload(files: FileList | null) {
    if (!files) return;
    setError(null);
    start(async () => {
      for (const file of Array.from(files)) {
        try {
          const compressed = await compressPhoto(file);
          const url = await uploadPhotoBlob(compressed);
          const res = await addImage(itemId, url);
          if (!res.ok) setError(res.error);
          else void makeCutout(url, compressed);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Upload failed");
        }
      }
    });
  }

  async function retryCutout(image: ItemImage) {
    setError(null);
    const originalUrl = image.original_url ?? image.url;
    try {
      const response = await fetch(originalUrl);
      if (!response.ok) throw new Error();
      await makeCutout(originalUrl, await response.blob());
    } catch {
      setError("Couldn't load that photo to cut it out.");
    }
  }

  return (
    <section aria-label="Photos" className="flex flex-col gap-2">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {sorted.map((image) => {
          const originalUrl = image.original_url ?? image.url;
          const isCutting = cutting.has(originalUrl);
          return (
            <div key={image.id} className="relative aspect-[3/4] h-56 shrink-0 overflow-hidden rounded-lg bg-muted">
              <img src={image.url} alt="" className={`size-full ${imageFitClass([image])}`} />
              <button
                type="button"
                aria-label={image.is_primary ? "Main photo" : "Make main photo"}
                aria-pressed={image.is_primary}
                disabled={pending}
                className="absolute top-1 left-1 grid size-9 place-items-center rounded-md bg-background/80 backdrop-blur"
                onClick={() => start(async () => { await setPrimaryImage(itemId, image.id); })}
              >
                <Star className="size-4" fill={image.is_primary ? "currentColor" : "none"} />
              </button>
              <button
                type="button"
                aria-label="Delete photo"
                disabled={pending}
                className="absolute top-1 right-1 grid size-9 place-items-center rounded-md bg-background/80 backdrop-blur"
                onClick={() => start(async () => { await removeImage(image.id); })}
              >
                <X className="size-4" />
              </button>
              {image.cutout_url ? (
                <ViewToggle
                  view={image.url === image.cutout_url ? "cutout" : "original"}
                  disabled={pending}
                  onChange={(view) => start(async () => { await setImageVersion(image.id, view); })}
                />
              ) : isCutting ? (
                <span className="badge absolute inset-x-1 bottom-1 justify-center gap-1"><Loader2 className="size-3 animate-spin" /> Making cutout…</span>
              ) : (
                <button type="button" className="absolute inset-x-1 bottom-1 h-8 rounded-md bg-background/80 text-[11px] backdrop-blur" onClick={() => retryCutout(image)}>
                  Make cutout
                </button>
              )}
            </div>
          );
        })}
      </div>
      <CutoutProgress />
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      <Button type="button" variant="outline" disabled={pending} onClick={() => inputRef.current?.click()}>
        <ImagePlus /> {pending ? "Working…" : "Add photos"}
      </Button>
      {error && <p role="alert" className="text-sm font-medium">{error}</p>}
    </section>
  );
}
