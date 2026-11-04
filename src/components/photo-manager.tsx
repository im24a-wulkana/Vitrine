"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addImage, removeImage, setPrimaryImage } from "@/lib/actions/items";
import type { ItemImage } from "@/lib/types";
import { uploadItemPhoto } from "@/lib/upload";

export function PhotoManager({ itemId, images }: { itemId: string; images: ItemImage[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sorted = [...images].sort((a, b) => a.position - b.position);

  function upload(files: FileList | null) {
    if (!files) return;
    setError(null);
    start(async () => {
      for (const file of Array.from(files)) {
        try {
          const url = await uploadItemPhoto(file, itemId);
          const res = await addImage(itemId, url);
          if (!res.ok) setError(res.error);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Upload failed");
        }
      }
    });
  }

  return (
    <section aria-label="Photos" className="flex flex-col gap-2">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {sorted.map((image) => (
          <div key={image.id} className="relative aspect-[3/4] overflow-hidden rounded-lg h-48 shrink-0 bg-muted">
            <img src={image.url} alt="" className="size-full object-cover" />
            <button
              type="button"
              aria-label={image.is_primary ? "Main photo" : "Make main photo"}
              aria-pressed={image.is_primary}
              disabled={pending}
              className="absolute top-1 left-1 grid size-9 place-items-center bg-background"
              onClick={() => start(async () => { await setPrimaryImage(itemId, image.id); })}
            >
              <Star className="size-4" fill={image.is_primary ? "currentColor" : "none"} />
            </button>
            <button
              type="button"
              aria-label="Delete photo"
              disabled={pending}
              className="absolute top-1 right-1 grid size-9 place-items-center bg-background"
              onClick={() => start(async () => { await removeImage(image.id); })}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      <Button type="button" variant="outline" disabled={pending} onClick={() => inputRef.current?.click()}>
        <ImagePlus /> {pending ? "Working…" : "Add photos"}
      </Button>
      {error && <p role="alert" className="text-sm font-medium">{error}</p>}
    </section>
  );
}
