"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteOutfit, saveOutfit, wearOutfit } from "@/lib/actions/wardrobe";
import { localDate, primaryImage } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface OutfitPiece {
  id: string;
  brand: string;
  name: string;
  status: string;
  item_images: { url: string; is_primary: boolean; position: number }[];
}

export interface OutfitRow {
  id: string;
  name: string;
  outfit_items: { item_id: string; position: number }[];
}

export function OutfitBuilder({ pieces, outfits, startWith }: { pieces: OutfitPiece[]; outfits: OutfitRow[]; startWith?: string }) {
  const [editing, setEditing] = useState<{ id?: string } | null>(startWith ? {} : null);
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<string[]>(startWith ? [startWith] : []);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const byId = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);
  // Your personal pieces, plus anything already in this outfit (for example, added from the closet).
  const selectable = pieces.filter((p) => p.status === "personal" || chosen.includes(p.id));

  function openEditor(outfit?: OutfitRow) {
    setEditing({ id: outfit?.id });
    setName(outfit?.name ?? "");
    setChosen(outfit ? [...outfit.outfit_items].sort((a, b) => a.position - b.position).map((i) => i.item_id).filter((id) => byId.has(id)) : []);
    setError(null);
    setNotice(null);
  }

  function togglePiece(id: string) {
    setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await saveOutfit({ id: editing?.id, name, itemIds: chosen });
      if (!res.ok) return setError(res.error);
      setEditing(null);
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="page-title">{editing.id ? "Edit outfit" : "New outfit"}</h1>
        <Input aria-label="Outfit name" placeholder="Outfit name" value={name} onChange={(e) => setName(e.target.value)} />

        {chosen.length > 0 && (
          <ol aria-label="Selected pieces" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4">
            {chosen.map((id) => {
              const image = primaryImage(byId.get(id)?.item_images);
              return (
                <li key={id} className="aspect-[3/4] overflow-hidden rounded-lg h-28 shrink-0 bg-muted">
                  {image && <img src={image} alt={byId.get(id)?.name ?? ""} className="size-full object-cover" />}
                </li>
              );
            })}
          </ol>
        )}

        {selectable.length === 0 ? (
          <p className="text-muted-foreground">Outfits use your personal items. Mark some items as Personal first.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 md:grid-cols-5">
            {selectable.map((piece) => {
              const image = primaryImage(piece.item_images);
              const order = chosen.indexOf(piece.id);
              return (
                <li key={piece.id}>
                  <button type="button" aria-pressed={order >= 0} className="w-full text-left" onClick={() => togglePiece(piece.id)}>
                    <span className={cn("relative block aspect-[3/4] overflow-hidden rounded-lg bg-muted", order >= 0 && "outline-2 -outline-offset-2 outline-foreground")}>
                      {image && <img src={image} alt="" loading="lazy" className="size-full object-cover" />}
                      {order >= 0 && <span className="num absolute top-0 left-0 grid size-6 place-items-center bg-foreground text-xs text-background">{order + 1}</span>}
                    </span>
                    <span className="eyebrow mt-1 block truncate">{piece.brand}</span>
                    <span className="block truncate text-xs">{piece.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {error && <p role="alert" className="text-sm font-medium">{error}</p>}
        <div className="pb-safe sticky bottom-16 grid grid-cols-2 gap-2 border-t bg-background py-3 md:bottom-0">
          <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          <Button disabled={pending} onClick={save}>{pending ? "Saving…" : "Save outfit"}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between gap-4">
        <h1 className="page-title">Outfits</h1>
        <Button onClick={() => openEditor()}>New outfit</Button>
      </header>
      {notice && <p role="status" className="border border-foreground px-3 py-2 text-sm">{notice}</p>}
      {error && <p role="alert" className="text-sm font-medium">{error}</p>}
      {outfits.length === 0 ? (
        <p className="py-12 page-title">No outfits yet.</p>
      ) : (
        <ul className="flex flex-col gap-8">
          {outfits.map((outfit) => {
            const items = [...outfit.outfit_items].sort((a, b) => a.position - b.position);
            return (
              <li key={outfit.id}>
                <h2 className="text-xl font-bold tracking-tight uppercase">{outfit.name}</h2>
                <div className="no-scrollbar -mx-4 mt-2 flex gap-1 overflow-x-auto px-4">
                  {items.map(({ item_id }) => {
                    const piece = byId.get(item_id);
                    const image = primaryImage(piece?.item_images);
                    return (
                      <div key={item_id} className="aspect-[3/4] overflow-hidden rounded-lg h-40 shrink-0 bg-muted">
                        {image && <img src={image} alt={piece?.name ?? ""} loading="lazy" className="size-full object-cover" />}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2">
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        setError(null);
                        const res = await wearOutfit(outfit.id, localDate());
                        if (!res.ok) return setError(res.error);
                        setNotice(`Logged today's wear for ${items.length} ${items.length === 1 ? "piece" : "pieces"} in ${outfit.name}.`);
                      })
                    }
                  >
                    Wearing this today
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEditor(outfit)}>Edit</Button>
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
