"use client";

import { useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import type { OutfitPiece } from "@/components/outfit-builder";
import { OutfitSlots } from "@/components/outfit-slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveOutfit } from "@/lib/actions/wardrobe";
import { imageFitClass, primaryImage } from "@/lib/format";
import { defaultPlacement, moveLayer, replaceSlot, type Placement } from "@/lib/outfits";
import { OCCASIONS } from "@/lib/types";
import { cn } from "@/lib/utils";

// Konva needs the browser's canvas, so it can't run on the server.
const OutfitCanvas = dynamic(() => import("@/components/outfit-canvas"), {
  ssr: false,
  loading: () => <div className="aspect-[3/4] w-full rounded-lg bg-[#d4d4d4]" />,
});

export type OutfitMode = "canvas" | "slots";

export interface OutfitDraft {
  id?: string;
  name: string;
  occasion: string | null;
  mode: OutfitMode;
  placements: Placement[];
}

interface Props {
  draft: OutfitDraft;
  pieces: OutfitPiece[];
  onDone: () => void;
}

export function OutfitEditor({ draft, pieces, onDone }: Props) {
  const [name, setName] = useState(draft.name);
  const [occasion, setOccasion] = useState(draft.occasion ?? "");
  const [mode, setMode] = useState<OutfitMode>(draft.mode);
  const [placements, setPlacements] = useState<Placement[]>(draft.placements);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const byId = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);
  const categoryOf = (itemId: string) => byId.get(itemId)?.category ?? null;
  const placedIds = new Set(placements.map((p) => p.item_id));
  // Your personal pieces, plus anything already in this outfit (for example, added from the closet).
  const selectable = pieces.filter((p) => p.status === "personal" || placedIds.has(p.id));

  // The canvas shows cutouts where they exist, because plain photos don't layer well.
  function canvasImage(itemId: string): string | null {
    const images = byId.get(itemId)?.item_images;
    const url = primaryImage(images);
    return images?.find((i) => i.url === url)?.cutout_url ?? url;
  }

  function togglePiece(piece: OutfitPiece) {
    if (placedIds.has(piece.id)) {
      setPlacements((all) => all.filter((p) => p.item_id !== piece.id));
      if (selectedId === piece.id) setSelectedId(null);
    } else {
      setPlacements((all) => [...all, defaultPlacement(piece.id, piece.category, all)]);
      setSelectedId(piece.id);
    }
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await saveOutfit({ id: draft.id, name, occasion: occasion || null, mode, placements });
      if (!res.ok) return setError(res.error);
      onDone();
    });
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5">
      <h1 className="page-title">{draft.id ? "Edit outfit" : "New outfit"}</h1>

      <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
        <Input aria-label="Outfit name" placeholder="Outfit name" value={name} onChange={(e) => setName(e.target.value)} />
        <select aria-label="Occasion" className="field min-w-0 text-sm" value={occasion} onChange={(e) => setOccasion(e.target.value)}>
          <option value="">Occasion</option>
          {OCCASIONS.map((o) => <option key={o}>{o}</option>)}
        </select>
      </div>

      <div role="group" aria-label="Builder" className="grid grid-cols-2 gap-1.5">
        {(["slots", "canvas"] as const).map((option) => (
          <button key={option} type="button" className="chip justify-center capitalize" data-active={mode === option} aria-pressed={mode === option} onClick={() => setMode(option)}>
            {option}
          </button>
        ))}
      </div>

      {selectable.length === 0 ? (
        <p className="text-muted-foreground">Outfits use your personal items. Mark some items as Personal first.</p>
      ) : mode === "slots" ? (
        <OutfitSlots
          pieces={selectable}
          placements={placements}
          categoryOf={categoryOf}
          onPick={(slot, itemId) => setPlacements((all) => replaceSlot(all, slot, itemId, categoryOf))}
        />
      ) : (
        <>
          <OutfitCanvas
            placements={placements}
            imageFor={canvasImage}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={(itemId, change) => setPlacements((all) => all.map((p) => (p.item_id === itemId ? { ...p, ...change } : p)))}
          />

          <div className="grid grid-cols-3 gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!selectedId} onClick={() => selectedId && setPlacements((all) => moveLayer(all, selectedId, 1))}>
              <ArrowUp /> Forward
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!selectedId} onClick={() => selectedId && setPlacements((all) => moveLayer(all, selectedId, -1))}>
              <ArrowDown /> Back
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!selectedId}
              onClick={() => {
                setPlacements((all) => all.filter((p) => p.item_id !== selectedId));
                setSelectedId(null);
              }}
            >
              <Trash2 /> Remove
            </Button>
          </div>

          <section aria-label="Pieces">
            <h2 className="eyebrow mb-2">Tap to add or remove</h2>
            <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
              {selectable.map((piece) => {
                const image = primaryImage(piece.item_images);
                const placed = placedIds.has(piece.id);
                return (
                  <li key={piece.id} className="w-20 shrink-0">
                    <button type="button" aria-pressed={placed} aria-label={`${piece.brand} ${piece.name}`} className={cn("block aspect-[3/4] w-full overflow-hidden rounded-md bg-muted", placed && "outline-2 -outline-offset-2 outline-foreground")} onClick={() => togglePiece(piece)}>
                      {image && <img src={image} alt="" draggable={false} loading="lazy" className={`size-full ${imageFitClass(piece.item_images)}`} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      {error && <p role="alert" className="text-sm font-medium">{error}</p>}
      <div className="pb-safe sticky bottom-16 z-10 grid grid-cols-2 gap-2 border-t bg-background py-3 md:bottom-0">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="button" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save outfit"}</Button>
      </div>
    </div>
  );
}
