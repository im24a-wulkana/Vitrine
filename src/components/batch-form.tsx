"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";
import { CutoutProgress, PhotoTile } from "@/components/photo-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createItem } from "@/lib/actions/items";
import { localDate } from "@/lib/format";
import { CATEGORIES } from "@/lib/types";
import { attachPendingCutouts, imagesForSave, usePhotos } from "@/lib/use-photos";

const MAX_PHOTOS = 40;

/** One photo becomes one item. Shared details are set once at the top. */
export function BatchForm({ brands }: { brands: string[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { photos, add, setView, remove } = usePhotos();
  const [rows, setRows] = useState<Record<string, { brand?: string; name?: string; price?: string }>>({});
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"in_stock" | "personal">("in_stock");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const setRow = (key: string, change: { brand?: string; name?: string; price?: string }) =>
    setRows((all) => ({ ...all, [key]: { ...all[key], ...change } }));

  function pick(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    if (chosen.length < files.length) setError(`A batch holds ${MAX_PHOTOS} photos. Save these first, then add the rest.`);
    else setError(null);
    add(chosen, () => crypto.randomUUID());
  }

  function save() {
    setError(null);
    const incomplete = photos.filter((p) => !(rows[p.key]?.brand ?? brand).trim() || !rows[p.key]?.name?.trim());
    if (incomplete.length) return setError(`${incomplete.length} ${incomplete.length === 1 ? "item needs" : "items need"} a brand and a name.`);
    const badPrice = photos.some((p) => !(Number(rows[p.key]?.price || 0) >= 0));
    if (badPrice) return setError("One of the prices isn't a valid number.");

    start(async () => {
      let saved = 0;
      for (const photo of photos) {
        const row = rows[photo.key] ?? {};
        const price = Number(row.price || 0);
        const { images } = await imagesForSave([photo]);
        const res = await createItem({
          id: photo.itemId,
          brand: row.brand ?? brand,
          name: row.name ?? "",
          category,
          status,
          buy_price: price,
          buy_currency: "CHF",
          buy_price_chf: price,
          buy_date: localDate(),
          buy_source: source,
          images,
        });
        if (!res.ok) {
          setError(`Saved ${saved} of ${photos.length}, then stopped: ${res.error}. Saved items are in your closet, so remove those photos before retrying.`);
          return;
        }
        attachPendingCutouts([photo]);
        saved += 1;
      }
      router.push("/closet");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />

      <section aria-label="Details for all items" className="flex flex-col gap-4 border-b pb-6">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="batch-brand">Brand for all</Label>
            <Input id="batch-brand" list="batch-brands" value={brand} onChange={(e) => setBrand(e.target.value)} />
            <datalist id="batch-brands">{brands.map((b) => <option key={b} value={b} />)}</datalist>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="batch-source">Bought from</Label>
            <Input id="batch-source" value={source} onChange={(e) => setSource(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm leading-none font-medium">Category</span>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" className="chip" data-active={category === c} aria-pressed={category === c} onClick={() => setCategory(category === c ? "" : c)}>{c}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm leading-none font-medium">Goes to</span>
          <div className="grid grid-cols-2 gap-1.5">
            {([["in_stock", "Stock"], ["personal", "Personal"]] as const).map(([value, label]) => (
              <button key={value} type="button" className="chip justify-center" data-active={status === value} aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>
            ))}
          </div>
        </div>
      </section>

      {photos.length > 0 && (
        <ul className="flex flex-col gap-4">
          {photos.map((photo, i) => (
            <li key={photo.key} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3">
              <PhotoTile photo={photo} className="w-full" onView={(view) => setView(photo.key, view)} onRemove={() => remove(photo)} />
              <div className="flex min-w-0 flex-col gap-2">
                <Input aria-label={`Item ${i + 1} name`} placeholder="Name" value={rows[photo.key]?.name ?? ""} onChange={(e) => setRow(photo.key, { name: e.target.value })} />
                <Input aria-label={`Item ${i + 1} brand`} placeholder={brand || "Brand"} value={rows[photo.key]?.brand ?? ""} onChange={(e) => setRow(photo.key, { brand: e.target.value })} />
                <Input aria-label={`Item ${i + 1} price paid in CHF`} placeholder="Paid, CHF" inputMode="decimal" className="num" value={rows[photo.key]?.price ?? ""} onChange={(e) => setRow(photo.key, { price: e.target.value.replace(",", ".") })} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <CutoutProgress />

      <Button type="button" size="lg" variant={photos.length ? "outline" : "default"} onClick={() => inputRef.current?.click()}>
        <ImagePlus /> {photos.length ? "Add more photos" : "Choose photos"}
      </Button>

      {error && <p role="alert" className="rounded-lg border border-foreground px-3 py-2 text-sm font-medium">{error}</p>}

      {photos.length > 0 && (
        <Button type="button" size="lg" disabled={pending} onClick={save}>
          {pending ? "Saving…" : `Save ${photos.length} ${photos.length === 1 ? "item" : "items"}`}
        </Button>
      )}
    </div>
  );
}
