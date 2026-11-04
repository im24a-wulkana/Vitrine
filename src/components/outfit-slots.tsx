"use client";

import { useCallback, useEffect } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { OutfitPiece } from "@/components/outfit-builder";
import { imageFitClass, primaryImage } from "@/lib/format";
import { pieceInSlot, slotFor, SLOTS, type Placement, type Slot } from "@/lib/outfits";

function SlotRow({ slot, pieces, selectedId, onPick }: { slot: Slot; pieces: OutfitPiece[]; selectedId: string | null; onPick: (itemId: string | null) => void }) {
  // Index 0 is "none", because no slot has to be filled.
  const selectedIndex = selectedId ? Math.max(0, pieces.findIndex((p) => p.id === selectedId) + 1) : 0;
  const [viewport, embla] = useEmblaCarousel({ align: "center", containScroll: false, startIndex: selectedIndex });

  const onSelect = useCallback(() => {
    if (!embla) return;
    const index = embla.selectedScrollSnap();
    const next = index === 0 ? null : (pieces[index - 1]?.id ?? null);
    if (next !== selectedId) onPick(next);
  }, [embla, pieces, selectedId, onPick]);

  useEffect(() => {
    if (!embla) return;
    embla.on("select", onSelect);
    return () => {
      embla.off("select", onSelect);
    };
  }, [embla, onSelect]);

  if (pieces.length === 0) return null;
  const selected = pieces.find((p) => p.id === selectedId);

  return (
    <section aria-roledescription="carousel" aria-label={slot}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="eyebrow">{slot}</h3>
        <p className="min-w-0 truncate text-xs text-muted-foreground" aria-live="polite">{selected ? `${selected.brand} · ${selected.name}` : "None"}</p>
      </div>
      <div className="relative">
        <div ref={viewport} className="-mx-4 overflow-hidden md:mx-0">
          <div className="flex touch-pan-y">
            <div className="min-w-0 flex-[0_0_27%] px-1 md:flex-[0_0_20%]">
              <button type="button" tabIndex={-1} aria-label={`No ${slot.toLowerCase()}`} className={`eyebrow grid aspect-[3/4] w-full place-items-center rounded-lg border border-dashed transition-opacity ${selectedId ? "opacity-40" : ""}`} onClick={() => embla?.scrollTo(0)}>
                None
              </button>
            </div>
            {pieces.map((piece, i) => {
              const image = primaryImage(piece.item_images);
              return (
                <div key={piece.id} className="min-w-0 flex-[0_0_27%] px-1 md:flex-[0_0_20%]">
                  <button type="button" tabIndex={-1} aria-label={`${piece.brand} ${piece.name}`} className={`block aspect-[3/4] w-full overflow-hidden rounded-lg bg-muted transition-opacity ${selectedId === piece.id ? "" : "opacity-40"}`} onClick={() => embla?.scrollTo(i + 1)}>
                    {image && <img src={image} alt="" draggable={false} loading="lazy" className={`size-full ${imageFitClass(piece.item_images)}`} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <button type="button" aria-label={`Previous ${slot.toLowerCase()}`} className="absolute top-1/2 -left-1 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-background/80 backdrop-blur" onClick={() => embla?.scrollPrev()}>
          <ChevronLeft className="size-5" strokeWidth={1.5} />
        </button>
        <button type="button" aria-label={`Next ${slot.toLowerCase()}`} className="absolute top-1/2 -right-1 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-background/80 backdrop-blur" onClick={() => embla?.scrollNext()}>
          <ChevronRight className="size-5" strokeWidth={1.5} />
        </button>
      </div>
    </section>
  );
}

interface Props {
  pieces: OutfitPiece[];
  placements: Placement[];
  categoryOf: (itemId: string) => string | null;
  onPick: (slot: Slot, itemId: string | null) => void;
}

export function OutfitSlots({ pieces, placements, categoryOf, onPick }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {SLOTS.map((slot) => (
        <SlotRow
          key={slot}
          slot={slot}
          pieces={pieces.filter((p) => slotFor(p.category) === slot)}
          selectedId={pieceInSlot(placements, slot, categoryOf)?.item_id ?? null}
          onPick={(itemId) => onPick(slot, itemId)}
        />
      ))}
    </div>
  );
}
