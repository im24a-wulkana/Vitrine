"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CheckSquare, LayoutGrid, Search, Table2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SoldDialog, type SoldTarget } from "@/components/sold-dialog";
import { bulkSetStatus, deleteItems } from "@/lib/actions/items";
import { daysBetween, localDate, money, primaryImage, signedMoney } from "@/lib/format";
import { ITEM_STATUSES, STATUS_LABEL, type InventoryItem, type ItemStatus, type Platform } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortKey = "newest" | "oldest" | "price_high" | "price_low" | "brand";

function openListing(item: InventoryItem) {
  return item.listings.find((l) => !l.delisted_at) ?? null;
}

function soldTarget(item: InventoryItem): SoldTarget {
  const l = openListing(item);
  return {
    id: item.id,
    brand: item.brand,
    name: item.name,
    buy_price_chf: item.buy_price_chf,
    platform: l?.platform,
    list_price: l?.list_price,
  };
}

export function InventoryView({ items, platforms }: { items: InventoryItem[]; platforms: Platform[] }) {
  const [view, setView] = useState<"grid" | "table">("grid");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ItemStatus | "all">("all");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selling, setSelling] = useState<SoldTarget | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    const saved = window.localStorage.getItem("vitrine.inventoryView");
    if (saved === "table" || saved === "grid") setView(saved);
  }, []);
  function changeView(next: "grid" | "table") {
    setView(next);
    window.localStorage.setItem("vitrine.inventoryView", next);
  }

  const brands = useMemo(() => [...new Set(items.map((i) => i.brand))].sort((a, b) => a.localeCompare(b)), [items]);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean) as string[])].sort(), [items]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const s of ITEM_STATUSES) c[s] = 0;
    for (const i of items) c[i.status] += 1;
    return c;
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      if (brand && i.brand !== brand) return false;
      if (category && i.category !== category) return false;
      if (q) {
        const haystack = [i.brand, i.name, i.color, i.size, i.category, i.buy_source, i.notes, ...i.tags].join(" ").toLowerCase();
        if (!q.split(/\s+/).every((word) => haystack.includes(word))) return false;
      }
      return true;
    });
    const sorters: Record<SortKey, (a: InventoryItem, b: InventoryItem) => number> = {
      newest: (a, b) => b.created_at.localeCompare(a.created_at),
      oldest: (a, b) => a.created_at.localeCompare(b.created_at),
      price_high: (a, b) => b.buy_price_chf - a.buy_price_chf,
      price_low: (a, b) => a.buy_price_chf - b.buy_price_chf,
      brand: (a, b) => a.brand.localeCompare(b.brand),
    };
    return [...filtered].sort(sorters[sort]);
  }, [items, query, status, brand, category, sort]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
    setConfirmingDelete(false);
  }

  function applyStatus(next: "personal" | "in_stock" | "listed") {
    start(async () => {
      const res = await bulkSetStatus([...selected], next);
      if (!res.ok) return setMessage(res.error);
      const { changed, skipped } = res.data;
      setMessage(`${changed} moved to ${STATUS_LABEL[next]}${skipped ? `. ${skipped} sold left unchanged.` : "."}`);
      stopSelecting();
    });
  }

  function applyDelete() {
    start(async () => {
      const res = await deleteItems([...selected]);
      if (!res.ok) return setMessage(res.error);
      setMessage(`${res.data.count} deleted.`);
      stopSelecting();
    });
  }

  const today = localDate();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <h1 className="page-title">Stock</h1>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Select items" aria-pressed={selecting} className="grid size-11 place-items-center data-[active=true]:bg-foreground data-[active=true]:text-background" data-active={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
            <CheckSquare className="size-5" strokeWidth={1.5} />
          </button>
          <button type="button" aria-label="Grid view" aria-pressed={view === "grid"} className="grid size-11 place-items-center data-[active=true]:bg-foreground data-[active=true]:text-background" data-active={view === "grid"} onClick={() => changeView("grid")}>
            <LayoutGrid className="size-5" strokeWidth={1.5} />
          </button>
          <button type="button" aria-label="Table view" aria-pressed={view === "table"} className="grid size-11 place-items-center data-[active=true]:bg-foreground data-[active=true]:text-background" data-active={view === "table"} onClick={() => changeView("table")}>
            <Table2 className="size-5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" aria-label="Search inventory" placeholder="Search brand, name, tag…" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
        {(["all", ...ITEM_STATUSES] as const).map((s) => (
          <button key={s} type="button" className="chip gap-1.5" data-active={status === s} aria-pressed={status === s} onClick={() => setStatus(s)}>
            {s === "all" ? "All" : STATUS_LABEL[s]} <span className="num text-xs opacity-60">{counts[s]}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <select aria-label="Filter by brand" className="field min-w-0 text-sm" value={brand} onChange={(e) => setBrand(e.target.value)}>
          <option value="">All brands</option>
          {brands.map((b) => <option key={b}>{b}</option>)}
        </select>
        <select aria-label="Filter by category" className="field min-w-0 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select aria-label="Sort" className="field min-w-0 text-sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="price_high">Cost: high</option>
          <option value="price_low">Cost: low</option>
          <option value="brand">Brand A–Z</option>
        </select>
      </div>

      {message && (
        <p role="status" className="flex items-center justify-between border border-foreground px-3 py-2 text-sm">
          {message}
          <button type="button" aria-label="Dismiss" onClick={() => setMessage(null)}><X className="size-4" /></button>
        </p>
      )}

      {visible.length === 0 ? (
        <div className="flex flex-col items-start gap-3 py-16">
          {items.length === 0 ? (
            <>
              <p className="font-heading text-3xl">Nothing here yet.</p>
              <Button asChild><Link href="/items/new">Add your first item</Link></Button>
            </>
          ) : (
            <p className="text-muted-foreground">No items match these filters.</p>
          )}
        </div>
      ) : view === "grid" ? (
        <ul className="grid grid-cols-2 gap-x-2 gap-y-6 md:grid-cols-3 lg:grid-cols-4">
          {visible.map((item) => {
            const image = primaryImage(item.item_images);
            const listing = openListing(item);
            const isSelected = selected.has(item.id);
            const body = (
              <>
                <div className="relative aspect-[4/5] overflow-hidden bg-muted">
                  {image ? (
                    <img src={image} alt={`${item.brand} ${item.name}`} loading="lazy" className={cn("size-full object-cover", item.status === "sold" && "opacity-50 grayscale")} />
                  ) : (
                    <span className="eyebrow grid size-full place-items-center">No photo</span>
                  )}
                  <span className="eyebrow absolute top-0 left-0 bg-background px-1.5 py-0.5 text-foreground">{STATUS_LABEL[item.status]}</span>
                  {selecting && (
                    <span aria-hidden className={cn("absolute top-1 right-1 grid size-7 place-items-center border-2 border-foreground bg-background", isSelected && "bg-foreground text-background")}>
                      {isSelected && "✓"}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-col gap-0.5 text-left">
                  <span className="eyebrow truncate">{item.brand}</span>
                  <span className="truncate text-sm">{item.name}</span>
                  <span className="num text-sm">
                    {item.sales ? (
                      <>{signedMoney(Number(item.sales.net_profit))}</>
                    ) : listing?.list_price != null ? (
                      <>{money(Number(listing.list_price))} <span className="text-muted-foreground">/ {money(item.buy_price_chf)}</span></>
                    ) : (
                      money(item.buy_price_chf)
                    )}
                  </span>
                </div>
              </>
            );
            return (
              <li key={item.id} className="flex min-w-0 flex-col">
                {selecting ? (
                  <button type="button" aria-pressed={isSelected} className="min-w-0" onClick={() => toggle(item.id)}>{body}</button>
                ) : (
                  <Link href={`/items/${item.id}`} className="min-w-0">{body}</Link>
                )}
                {!selecting && item.status !== "sold" && (
                  <Button type="button" variant="outline" size="sm" className="mt-2 w-full" onClick={() => setSelling(soldTarget(item))}>
                    Sold
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="-mx-4 overflow-x-auto md:mx-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="eyebrow border-b text-left">
                {selecting && <th className="w-10 p-2"><span className="sr-only">Select</span></th>}
                <th className="p-2 pl-4 font-normal md:pl-2">Item</th>
                <th className="p-2 font-normal">Status</th>
                <th className="p-2 text-right font-normal">Cost</th>
                <th className="p-2 text-right font-normal">List</th>
                <th className="p-2 text-right font-normal">Net</th>
                <th className="p-2 text-right font-normal">Days</th>
                <th className="p-2"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const listing = openListing(item);
                const image = primaryImage(item.item_images);
                return (
                  <tr key={item.id} className="border-b">
                    {selecting && (
                      <td className="p-2">
                        <input type="checkbox" className="size-5 accent-foreground" aria-label={`Select ${item.name}`} checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                      </td>
                    )}
                    <td className="p-2 pl-4 md:pl-2">
                      <Link href={`/items/${item.id}`} className="flex items-center gap-3">
                        <span className="block size-12 shrink-0 bg-muted">
                          {image && <img src={image} alt="" loading="lazy" className="size-full object-cover" />}
                        </span>
                        <span className="min-w-0">
                          <span className="eyebrow block">{item.brand}</span>
                          <span className="block max-w-56 truncate">{item.name}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="p-2 whitespace-nowrap">{STATUS_LABEL[item.status]}</td>
                    <td className="num p-2 text-right">{money(item.buy_price_chf)}</td>
                    <td className="num p-2 text-right">{listing?.list_price != null ? money(Number(listing.list_price)) : "—"}</td>
                    <td className="num p-2 text-right">{item.sales ? signedMoney(Number(item.sales.net_profit)) : "—"}</td>
                    <td className="num p-2 text-right">{listing ? daysBetween(listing.listed_at, today) : "—"}</td>
                    <td className="p-2 text-right">
                      {item.status !== "sold" && (
                        <Button type="button" variant="outline" size="sm" onClick={() => setSelling(soldTarget(item))}>Sold</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selecting && (
        <div className="pb-safe fixed inset-x-0 bottom-16 z-40 border-t bg-background p-3 md:bottom-0">
          <div className="mx-auto flex max-w-6xl flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="num">{selected.size} selected</span>
              <button type="button" className="underline underline-offset-4" onClick={() => setSelected(new Set(visible.map((i) => i.id)))}>Select all {visible.length}</button>
            </div>
            {confirmingDelete ? (
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" size="sm" disabled={pending} onClick={applyDelete}>Delete {selected.size} permanently</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                <Button type="button" size="sm" variant="outline" disabled={pending || selected.size === 0} onClick={() => applyStatus("in_stock")}>Stock</Button>
                <Button type="button" size="sm" variant="outline" disabled={pending || selected.size === 0} onClick={() => applyStatus("listed")}>Listed</Button>
                <Button type="button" size="sm" variant="outline" disabled={pending || selected.size === 0} onClick={() => applyStatus("personal")}>Personal</Button>
                <Button type="button" size="sm" variant="outline" disabled={pending || selected.size === 0} onClick={() => setConfirmingDelete(true)}>Delete</Button>
              </div>
            )}
          </div>
        </div>
      )}

      <SoldDialog target={selling} platforms={platforms} onClose={() => setSelling(null)} />
    </div>
  );
}
