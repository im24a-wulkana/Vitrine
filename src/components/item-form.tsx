"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus } from "lucide-react";
import Link from "next/link";
import { AiMark, AiTagSheet } from "@/components/ai-tag-sheet";
import { CompHint } from "@/components/comp-hint";
import { CutoutProgress, PhotoTile } from "@/components/photo-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createItem, updateItem } from "@/lib/actions/items";
import type { ItemTags } from "@/lib/ai/schema";
import { colorName } from "@/lib/colors";
import { localDate, roundMoney } from "@/lib/format";
import { dominantColor, photoForAi } from "@/lib/image-pipeline";
import type { CompRow } from "@/lib/metrics";
import { CATEGORIES, CURRENCIES, MEASUREMENTS, OCCASIONS, SEASONS, type Item, type Measurements, type Platform } from "@/lib/types";
import { attachPendingCutouts, imagesForSave, usePhotos } from "@/lib/use-photos";

type AddStatus = "in_stock" | "personal" | "listed";

interface Props {
  brands: string[];
  platforms: Platform[];
  defaultCurrency: string;
  item?: Item; // present when editing
  comps?: CompRow[];
  aiEnabled?: boolean;
}

export function ItemForm({ brands, platforms, defaultCurrency, item, comps = [], aiEnabled = false }: Props) {
  const router = useRouter();
  const editing = !!item;
  const [itemId, setItemId] = useState(() => item?.id ?? crypto.randomUUID());

  const { photos, add: addPhotos, setView, remove: removePhoto, clear: clearPhotos } = usePhotos();
  const [brand, setBrand] = useState(item?.brand ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(item ? String(item.buy_price) : "");
  const [currency, setCurrency] = useState(item?.buy_currency ?? defaultCurrency);
  const [priceChf, setPriceChf] = useState(item && item.buy_currency !== "CHF" ? String(item.buy_price_chf) : "");
  const [rateState, setRateState] = useState<"idle" | "loading" | "failed">("idle");
  const [status, setStatus] = useState<AddStatus>("in_stock");
  const [category, setCategory] = useState(item?.category ?? "");
  const [listPlatform, setListPlatform] = useState(platforms[0]?.name ?? "");
  const [listPrice, setListPrice] = useState("");

  const [showMore, setShowMore] = useState(editing);
  const [size, setSize] = useState(item?.size ?? "");
  const [color, setColor] = useState(item?.colors?.length ? item.colors.join(", ") : (item?.color ?? ""));
  const [condition, setCondition] = useState(item?.condition ? String(item.condition) : "");
  const [buyDate, setBuyDate] = useState(item?.buy_date ?? (editing ? "" : localDate()));
  const [buySource, setBuySource] = useState(item?.buy_source ?? "");
  const [tags, setTags] = useState(item?.tags.join(", ") ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [subcategory, setSubcategory] = useState(item?.subcategory ?? "");
  const [seasons, setSeasons] = useState<string[]>(item?.seasons ?? []);
  const [occasions, setOccasions] = useState<string[]>(item?.occasions ?? []);
  const [storage, setStorage] = useState(item?.storage_location ?? "");
  const [measurements, setMeasurements] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(item?.measurements ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [favorite, setFavorite] = useState(item?.favorite ?? false);
  const toggleIn = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const [colorPrimary, setColorPrimary] = useState<string | null>(item?.color_primary ?? null);
  // AI suggestions. Nothing reaches the form until the user applies them, and a
  // field's mark goes away as soon as they edit it.
  const [aiState, setAiState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiTags, setAiTags] = useState<ItemTags | null>(null);
  const [aiSheetOpen, setAiSheetOpen] = useState(false);
  const [aiFields, setAiFields] = useState<Set<string>>(new Set());
  const [colorFromPhoto, setColorFromPhoto] = useState(false);
  const unmark = (field: string) =>
    setAiFields((all) => {
      if (!all.has(field)) return all;
      const next = new Set(all);
      next.delete(field);
      return next;
    });
  const taggedItem = useRef<string | null>(null);
  const colouredItem = useRef<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [pending, start] = useTransition();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const brandRef = useRef<HTMLInputElement>(null);

  // Own-history brand suggestions. One tap fills the field.
  const brandMatches = useMemo(() => {
    const q = brand.trim().toLowerCase();
    if (!q) return brands.slice(0, 6);
    return brands.filter((b) => b.toLowerCase().includes(q) && b.toLowerCase() !== q).slice(0, 6);
  }, [brand, brands]);

  // Prefill the CHF value from the rate on the purchase date. It stays editable.
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => {
    if (currency === "CHF") return;
    let cancelled = false;
    setRate(null);
    setRateState("loading");
    fetch(`/api/fx?from=${currency}&date=${buyDate}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b) => {
        if (cancelled) return;
        setRate(b.rate);
        setRateState("idle");
      })
      .catch(() => {
        if (!cancelled) setRateState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [currency, buyDate]);

  const chfTouched = useRef(editing);
  useEffect(() => {
    if (currency === "CHF" || chfTouched.current || rate === null) return;
    const value = Number(price);
    setPriceChf(price && value >= 0 ? String(roundMoney(value * rate)) : "");
  }, [price, rate, currency]);

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    addPhotos(Array.from(files), () => itemId);
    if (aiEnabled && taggedItem.current !== itemId) {
      taggedItem.current = itemId;
      void requestTags(files[0]);
    }
  }

  async function requestTags(file: File) {
    const forItem = itemId;
    setAiState("loading");
    setAiMessage(null);
    try {
      const form = new FormData();
      form.append("image", await photoForAi(file));
      const res = await fetch("/api/ai/tag", { method: "POST", body: form });
      const body = await res.json();
      // The user may have saved and moved on to the next item by now.
      if (taggedItem.current !== forItem) return;
      if (!res.ok) throw new Error(body.error);
      setAiTags(body.tags);
      setAiState("ready");
      setAiSheetOpen(true);
    } catch (e) {
      if (taggedItem.current !== forItem) return;
      setAiState("failed");
      setAiMessage(e instanceof Error && e.message ? e.message : "Couldn't get AI suggestions.");
    }
  }

  function applyTags(tags: ItemTags, useLabelAsBrand: boolean) {
    const marked = new Set<string>();
    if (tags.category) { setCategory(tags.category); marked.add("category"); }
    if (tags.subcategory) { setSubcategory(tags.subcategory); marked.add("subcategory"); }
    if (tags.colors?.length) { setColor(tags.colors.join(", ")); setColorFromPhoto(false); marked.add("color"); }
    if (tags.seasons?.length) { setSeasons(tags.seasons); marked.add("seasons"); }
    if (tags.occasions?.length) { setOccasions(tags.occasions); marked.add("occasions"); }
    if (useLabelAsBrand && tags.label_text) setBrand(tags.label_text);
    setAiFields(marked);
    setShowMore(true);
    setAiSheetOpen(false);
    setAiState("idle");
  }

  // Colour from the photo works with no AI at all, and fills the gap when AI isn't sure.
  // It waits for the cutout, because the background would otherwise skew it.
  const firstPhoto = photos[0];
  const colorSource = firstPhoto?.cutoutPreview ?? (firstPhoto?.cutoutState === "failed" ? firstPhoto.preview : null);
  useEffect(() => {
    if (editing || !colorSource || colouredItem.current === itemId) return;
    colouredItem.current = itemId;
    dominantColor(colorSource).then((hex) => {
      if (!hex || colouredItem.current !== itemId) return;
      setColorPrimary(hex);
      const name = colorName(hex);
      if (name) {
        setColor((current) => {
          if (current.trim()) return current;
          setColorFromPhoto(true);
          return name;
        });
      }
    });
  }, [colorSource, editing, itemId]);

  function resetForNext() {
    setItemId(crypto.randomUUID());
    clearPhotos();
    setCategory("");
    setSubcategory("");
    setSeasons([]);
    setOccasions([]);
    setColorPrimary(null);
    setColorFromPhoto(false);
    setAiFields(new Set());
    setAiTags(null);
    setAiState("idle");
    setAiMessage(null);
    setAiSheetOpen(false);
    taggedItem.current = null;
    colouredItem.current = null;
    setName("");
    setPrice("");
    setPriceChf("");
    chfTouched.current = false;
    setListPrice("");
    setSize("");
    setColor("");
    setCondition("");
    setTags("");
    setNotes("");
    setSavedCount((n) => n + 1);
    brandRef.current?.focus();
    window.scrollTo({ top: 0 });
  }

  function save(addAnother: boolean) {
    setError(null);
    const buyPrice = Number(price || 0);
    if (!brand.trim()) return setError("Brand is required");
    if (!name.trim()) return setError("Name is required");
    if (!(buyPrice >= 0)) return setError("Enter a valid price");

    const chf = currency === "CHF" ? buyPrice : Number(priceChf);
    if (currency !== "CHF" && (priceChf === "" || !(chf >= 0))) {
      return setError(`Enter the CHF value of this ${currency} price`);
    }

    const fields = {
      brand,
      name,
      category,
      size,
      color: color.split(",")[0]?.trim() ?? "",
      condition: condition ? Number(condition) : null,
      buy_price: buyPrice,
      buy_currency: currency,
      buy_price_chf: chf,
      buy_date: buyDate,
      buy_source: buySource,
      notes,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      color_primary: colorPrimary,
      subcategory,
      colors: color.split(",").map((c) => c.trim()).filter(Boolean),
      seasons,
      occasions,
      storage_location: storage,
      measurements: Object.fromEntries(
        Object.entries(measurements).filter(([, v]) => v !== "" && Number(v) >= 0).map(([k, v]) => [k, Number(v)]),
      ) as Measurements,
      favorite,
    };

    start(async () => {
      if (editing) {
        const res = await updateItem(item.id, fields);
        if (!res.ok) return setError(res.error);
        router.push(`/items/${item.id}`);
        return;
      }

      const { images, failed } = await imagesForSave(photos);

      const res = await createItem({
        ...fields,
        id: itemId,
        status,
        images,
        listing:
          status === "listed" && listPlatform
            ? { platform: listPlatform, list_price: listPrice ? Number(listPrice) : null }
            : undefined,
      });
      if (!res.ok) return setError(res.error);
      attachPendingCutouts(photos);
      if (failed > 0) {
        // The item is saved. Send the user to it so the missing photos can be re-added.
        router.push(`/items/${itemId}/edit?photos_failed=${failed}`);
        return;
      }
      if (addAnother) resetForNext();
      else router.push(`/items/${itemId}`);
    });
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
    >
      {savedCount > 0 && (
        <p role="status" className="num border border-foreground px-3 py-2 text-sm">
          {savedCount} saved. Next item.
        </p>
      )}

      {!editing && (
        <section aria-label="Photos">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          {photos.length > 0 && (
            <div className="no-scrollbar -mx-4 mb-2 flex snap-x gap-2 overflow-x-auto px-4">
              {photos.map((p) => (
                <PhotoTile key={p.key} photo={p} className="h-64 snap-start" onView={(view) => setView(p.key, view)} onRemove={() => removePhoto(p)} />
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="lg" variant={photos.length ? "outline" : "default"} onClick={() => cameraRef.current?.click()}>
              <Camera /> Camera
            </Button>
            <Button type="button" size="lg" variant="outline" onClick={() => libraryRef.current?.click()}>
              <ImagePlus /> Library
            </Button>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            <CutoutProgress />
            {aiState === "loading" && <p role="status" className="text-xs text-muted-foreground">Getting AI suggestions…</p>}
            {aiState === "failed" && <p role="status" className="text-xs text-muted-foreground">{aiMessage} You can fill this in yourself.</p>}
            {aiState === "ready" && !aiSheetOpen && (
              <button type="button" className="self-start py-1 text-sm underline underline-offset-4" onClick={() => setAiSheetOpen(true)}>Review AI suggestions</button>
            )}
            {!aiEnabled && photos.length > 0 && <p className="text-xs text-muted-foreground">AI tagging is off. Add ANTHROPIC_API_KEY to turn it on.</p>}
            <Link href="/items/batch" className="self-start py-1 text-sm underline underline-offset-4">Adding several items? Use batch upload</Link>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brand">Brand</Label>
        <Input ref={brandRef} id="brand" autoComplete="off" autoCapitalize="words" value={brand} onChange={(e) => setBrand(e.target.value)} />
        {brandMatches.length > 0 && (
          <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pt-1">
            {brandMatches.map((b) => (
              <button key={b} type="button" className="chip" onClick={() => setBrand(b)}>{b}</button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" autoComplete="off" autoCapitalize="sentences" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price">Paid</Label>
          <Input id="price" inputMode="decimal" className="num" placeholder="0.00" disabled={!!item?.lot_id} value={price} onChange={(e) => setPrice(e.target.value.replace(",", "."))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currency">Currency</Label>
          <select id="currency" className="field num" disabled={!!item?.lot_id} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {[...new Set([...CURRENCIES, currency])].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {item?.lot_id && <p className="-mt-4 text-xs text-muted-foreground">This item is in a lot, so its cost comes from the lot.</p>}

      {currency !== "CHF" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price-chf">Value in CHF</Label>
          <Input
            id="price-chf"
            inputMode="decimal"
            className="num"
            value={priceChf}
            onChange={(e) => {
              chfTouched.current = true;
              setPriceChf(e.target.value.replace(",", "."));
            }}
          />
          <p className="text-xs text-muted-foreground">
            {rateState === "loading" && "Looking up the rate…"}
            {rateState === "failed" && "Couldn't get a rate. Enter the CHF value yourself."}
            {rateState === "idle" && rate !== null && <>ECB rate <span className="num">{rate}</span> for this date. You can change the value.</>}
          </p>
        </div>
      )}

      {!editing && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm leading-none font-medium">Goes to</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {([["in_stock", "Stock"], ["listed", "Listed"], ["personal", "Personal"]] as const).map(([value, label]) => (
              <button key={value} type="button" className="chip justify-center" data-active={status === value} aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>
            ))}
          </div>
        </fieldset>
      )}

      {!editing && status === "listed" && (
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="list-platform">Platform</Label>
            <select id="list-platform" className="field" value={listPlatform} onChange={(e) => setListPlatform(e.target.value)}>
              {platforms.map((p) => <option key={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="list-price">List price</Label>
            <Input id="list-price" inputMode="decimal" className="num" value={listPrice} onChange={(e) => setListPrice(e.target.value.replace(",", "."))} />
          </div>
          <div className="col-span-2"><CompHint rows={comps} brand={brand} category={category || null} onUse={(p) => setListPrice(String(p))} /></div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm leading-none font-medium">Category{aiFields.has("category") && <AiMark />}</span>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className="chip" data-active={category === c} aria-pressed={category === c} onClick={() => { unmark("category"); setCategory(category === c ? "" : c); }}>{c}</button>
          ))}
        </div>
      </div>

      {!showMore ? (
        <button type="button" className="self-start py-1 text-sm underline underline-offset-4" onClick={() => setShowMore(true)}>
          More details
        </button>
      ) : (
        <div className="flex flex-col gap-6 border-t pt-6">
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="size">Size</Label>
              <Input id="size" value={size} onChange={(e) => setSize(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="color">Colors{aiFields.has("color") && <AiMark />}{colorFromPhoto && <span className="eyebrow ml-1.5 font-normal normal-case tracking-normal">From photo</span>}</Label>
              <Input id="color" value={color} onChange={(e) => { unmark("color"); setColorFromPhoto(false); setColor(e.target.value); }} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="condition">Condition</Label>
              <select id="condition" className="field num" value={condition} onChange={(e) => setCondition(e.target.value)}>
                <option value="">–</option>
                {Array.from({ length: 10 }, (_, i) => 10 - i).map((n) => <option key={n} value={n}>{n}/10</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="buy-date">Bought on</Label>
              <Input id="buy-date" type="date" className="num" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="source">Bought from</Label>
              <Input id="source" value={buySource} onChange={(e) => setBuySource(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="subcategory">Subcategory{aiFields.has("subcategory") && <AiMark />}</Label>
            <Input id="subcategory" placeholder="Knitwear, denim, boots" value={subcategory} onChange={(e) => { unmark("subcategory"); setSubcategory(e.target.value); }} />
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm leading-none font-medium">Season{aiFields.has("seasons") && <AiMark />}</legend>
            <div className="flex flex-wrap gap-1.5">
              {SEASONS.map((s) => (
                <button key={s} type="button" className="chip" data-active={seasons.includes(s)} aria-pressed={seasons.includes(s)} onClick={() => { unmark("seasons"); setSeasons(toggleIn(seasons, s)); }}>{s}</button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-sm leading-none font-medium">Occasion{aiFields.has("occasions") && <AiMark />}</legend>
            <div className="flex flex-wrap gap-1.5">
              {OCCASIONS.map((o) => (
                <button key={o} type="button" className="chip" data-active={occasions.includes(o)} aria-pressed={occasions.includes(o)} onClick={() => { unmark("occasions"); setOccasions(toggleIn(occasions, o)); }}>{o}</button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-sm leading-none font-medium">Measurements, cm</legend>
            <div className="grid grid-cols-3 gap-2">
              {MEASUREMENTS.map(([key, label]) => (
                <div key={key} className="flex min-w-0 flex-col gap-1">
                  <Label htmlFor={`m-${key}`} className="text-xs font-normal">{label}</Label>
                  <Input id={`m-${key}`} inputMode="decimal" className="num" value={measurements[key] ?? ""} onChange={(e) => setMeasurements({ ...measurements, [key]: e.target.value.replace(",", ".") })} />
                </div>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="storage">Storage location</Label>
            <Input id="storage" placeholder="Hall closet, box 3" value={storage} onChange={(e) => setStorage(e.target.value)} />
          </div>
          <button type="button" className="chip self-start" data-active={favorite} aria-pressed={favorite} onClick={() => setFavorite(!favorite)}>Favorite</button>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tags">Tags, comma separated</Label>
            <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      )}

      {error && <p role="alert" className="border border-foreground px-3 py-2 text-sm font-medium">{error}</p>}

      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Save item"}
        </Button>
        {!editing && (
          <Button type="button" size="lg" variant="outline" disabled={pending} onClick={() => save(true)}>
            Save and add another
          </Button>
        )}
      </div>
      {aiSheetOpen && aiTags && <AiTagSheet tags={aiTags} onApply={applyTags} onClose={() => setAiSheetOpen(false)} />}
    </form>
  );
}
