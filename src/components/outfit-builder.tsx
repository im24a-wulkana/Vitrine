"use client";

import { useMemo, useState, useTransition } from "react";
import { CanvasPreview } from "@/components/canvas-preview";
import { GenerateOutfit } from "@/components/generate-outfit";
import { OutfitEditor, type OutfitDraft, type OutfitMode } from "@/components/outfit-editor";
import { Button } from "@/components/ui/button";
import { deleteOutfit, wearOutfit } from "@/lib/actions/wardrobe";
import { imageFitClass, localDate, primaryImage } from "@/lib/format";
import { defaultPlacement, slotFor, SLOTS, type Placement } from "@/lib/outfits";

export interface OutfitPiece {
  id: string;
  brand: string;
  name: string;
  status: string;
  category: string | null;
  item_images: { url: string; is_primary: boolean; position: number; cutout_url: string | null }[];
}

export interface OutfitRow {
  id: string;
  name: string;
  mode: OutfitMode;
  occasion: string | null;
  outfit_items: (Placement & { position: number })[];
}

export function OutfitBuilder({ pieces, outfits, startWith, aiEnabled = false }: { pieces: OutfitPiece[]; outfits: OutfitRow[]; startWith?: string; aiEnabled?: boolean }) {
  const byId = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);
  const [draft, setDraft] = useState<OutfitDraft | null>(() => {
    const piece = startWith ? pieces.find((p) => p.id === startWith) : undefined;
    return piece ? { name: "", occasion: null, mode: "slots", placements: [defaultPlacement(piece.id, piece.category)] } : null;
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (draft) {
    return <OutfitEditor draft={draft} pieces={pieces} onDone={() => setDraft(null)} />;
  }

  function edit(outfit: OutfitRow) {
    setNotice(null);
    setDraft({
      id: outfit.id,
      name: outfit.name,
      occasion: outfit.occasion,
      mode: outfit.mode,
      placements: outfit.outfit_items
        .filter((i) => byId.has(i.item_id))
        .map(({ item_id, x, y, scale, rotation, z_index }) => ({ item_id, x, y, scale, rotation, z_index })),
    });
  }

  return (
    <div className="flex flex-col gap-6 pb-16">
      <GenerateOutfit
        pieces={pieces}
        aiEnabled={aiEnabled}
        onUse={(itemIds, occasion) => {
          setNotice(null);
          const placements: Placement[] = [];
          for (const id of itemIds) placements.push(defaultPlacement(id, byId.get(id)?.category ?? null, placements));
          setDraft({ name: "", occasion, mode: "slots", placements });
        }}
      />
      <header className="flex items-end justify-between gap-4">
        <h1 className="page-title">Outfits</h1>
        <Button onClick={() => { setNotice(null); setDraft({ name: "", occasion: null, mode: "slots", placements: [] }); }}>New outfit</Button>
      </header>
      {notice && <p role="status" className="rounded-lg border border-foreground px-3 py-2 text-sm">{notice}</p>}
      {error && <p role="alert" className="text-sm font-medium">{error}</p>}
      {outfits.length === 0 ? (
        <p className="py-12 page-title">No outfits yet.</p>
      ) : (
        <ul className="flex flex-col gap-8">
          {outfits.map((outfit) => {
            const inOrder = [...outfit.outfit_items].sort(
              (a, b) => SLOTS.indexOf(slotFor(byId.get(a.item_id)?.category ?? null)) - SLOTS.indexOf(slotFor(byId.get(b.item_id)?.category ?? null)),
            );
            return (
              <li key={outfit.id}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h2 className="min-w-0 truncate text-xl font-bold tracking-tight uppercase">{outfit.name}</h2>
                  {outfit.occasion && <span className="eyebrow shrink-0">{outfit.occasion}</span>}
                </div>
                {outfit.mode === "canvas" ? (
                  <CanvasPreview items={outfit.outfit_items} pieceFor={(id) => byId.get(id)} className="h-72 max-w-full rounded-lg" />
                ) : (
                  <div tabIndex={0} role="group" aria-label={`Pieces in ${outfit.name}`} className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
                    {inOrder.map(({ item_id }) => {
                      const piece = byId.get(item_id);
                      const image = primaryImage(piece?.item_images);
                      return (
                        <div key={item_id} className="aspect-[3/4] h-40 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {image && <img src={image} alt={piece?.name ?? ""} loading="lazy" className={`size-full ${imageFitClass(piece?.item_images)}`} />}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2">
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        setError(null);
                        const res = await wearOutfit(outfit.id, localDate());
                        if (!res.ok) return setError(res.error);
                        const count = outfit.outfit_items.length;
                        setNotice(`Logged today's wear for ${count} ${count === 1 ? "piece" : "pieces"} in ${outfit.name}.`);
                      })
                    }
                  >
                    Wearing this today
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => edit(outfit)}>Edit</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await deleteOutfit(outfit.id);
                        if (!res.ok) setError(res.error);
                      })
                    }
                  >
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
