"use client";

import { useSyncExternalStore } from "react";
import { Loader2, X } from "lucide-react";
import { cutoutStatusStore } from "@/lib/image-pipeline";
import type { Photo, PhotoView } from "@/lib/use-photos";
import { cn } from "@/lib/utils";

export function ViewToggle({ view, onChange, disabled }: { view: PhotoView; onChange: (view: PhotoView) => void; disabled?: boolean }) {
  return (
    <div role="group" aria-label="Photo version" className="absolute inset-x-1 bottom-1 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-background/80 p-0.5 text-[11px] backdrop-blur">
      {(["original", "cutout"] as const).map((option) => (
        <button key={option} type="button" disabled={disabled} aria-pressed={view === option} className={cn("h-8 rounded-sm capitalize", view === option && "bg-foreground text-background")} onClick={() => onChange(option)}>
          {option}
        </button>
      ))}
    </div>
  );
}

export function PhotoTile({ photo, onView, onRemove, className }: { photo: Photo; onView: (view: PhotoView) => void; onRemove: () => void; className?: string }) {
  const showCutout = photo.view === "cutout" && !!photo.cutoutPreview;
  return (
    <div className={cn("relative aspect-[3/4] shrink-0 overflow-hidden rounded-lg bg-muted", className)}>
      <img src={showCutout ? photo.cutoutPreview : photo.preview} alt="" className={cn("size-full", showCutout ? "cutout" : "object-cover")} />
      {!photo.originalUrl && !photo.originalFailed && (
        <span className="absolute inset-0 grid place-items-center bg-background/40"><Loader2 className="size-6 animate-spin" /><span className="sr-only">Uploading</span></span>
      )}
      <button type="button" aria-label="Remove photo" className="absolute top-1 right-1 grid size-9 place-items-center rounded-md bg-background/80 backdrop-blur" onClick={onRemove}>
        <X className="size-4" />
      </button>
      {photo.originalFailed ? (
        <span className="badge absolute inset-x-1 bottom-1 justify-center">Upload failed</span>
      ) : photo.cutoutState === "ready" ? (
        <ViewToggle view={photo.view} onChange={onView} />
      ) : (
        <span className="badge absolute inset-x-1 bottom-1 justify-center">
          {photo.cutoutState === "failed" ? "No cutout" : "Making cutout…"}
        </span>
      )}
    </div>
  );
}

/** Explains the wait, which is long once while the model downloads. */
export function CutoutProgress() {
  const { remaining, downloading } = useSyncExternalStore(cutoutStatusStore.subscribe, cutoutStatusStore.get, cutoutStatusStore.getServer);
  if (remaining === 0) return null;
  return (
    <p role="status" className="text-xs text-muted-foreground">
      {downloading !== null ? (
        <>Downloading the cutout model, first time only: <span className="num">{downloading}%</span>. You can keep filling in the form.</>
      ) : (
        <>Making cutouts on this device: <span className="num">{remaining}</span> left. You can save at any time; they finish in the background.</>
      )}
    </p>
  );
}
