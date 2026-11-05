"use client";

import { useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckSquare, Heart, LayoutGrid, MoreHorizontal, Search, SlidersHorizontal, Table2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SoldDialog, type SoldTarget } from "@/components/sold-dialog";
import { addToOutfit, bulkSetStatus, deleteItems, setFavorite } from "@/lib/actions/items";
import { logWear } from "@/lib/actions/wardrobe";
import { daysBetween, imageFitClass, localDate, money, primaryImage, signedMoney } from "@/lib/format";
import { costPerWear } from "@/lib/metrics";
import { closetTab, CLOSET_TABS, ITEM_STATUSES, STATUS_LABEL, type ClosetItem, type ClosetTab, type ItemStatus, type Platform } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortKey = "newest" | "oldest" | "price_high" | "price_low" | "most_worn" | "brand";

interface Filters {
  season: string[];
  occasion: string[];
  color: string[];
  brand: string[];
  status: string[];
  size: string[];
  tag: string[];
  favorites: boolean;
}

const NO_FILTERS: Filters = { season: [], occasion: [], color: [], brand: [], status: [], size: [], tag: [], favorites: false };

function openListing(item: ClosetItem) {
  return item.listings.find((l) => !l.delisted_at) ?? null;
}

function soldTarget(item: ClosetItem): SoldTarget {
  const l = openListing(item);
  return { id: item.id, brand: item.brand, name: item.name, buy_price_chf: item.buy_price_chf, platform: l?.platform, list_price: l?.list_price };
}

function unique(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b));
}

const iconButton = "grid size-11 place-items-center rounded-lg data-[active=true]:bg-foreground data-[active=true]:text-background";

const VIEW_KEY = "vitrine.closetView";
const viewListeners = new Set<() => void>();
function subscribeToView(listener: () => void) {
  viewListeners.add(listener);
  return () => {
    viewListeners.delete(listener);
  };
}

export function ClosetView({ items, platforms, outfits, unwornCount }: { items: ClosetItem[]; platforms: Platform[]; outfits: { id: string; name: string }[]; unwornCount: number }) {
  const router = useRouter();
  const savedView = useSyncExternalStore(subscribeToView, () => window.localStorage.getItem(VIEW_KEY), () => null);
  const view: "grid" | "table" = savedView === "table" ? "table" : "grid";
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<ClosetTab>("All");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<SortKey>("newest");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuItem, setMenuItem] = useState<ClosetItem | null>(null);
  const [outfitPicking, setOutfitPicking] = useState(false);
  const [selling, setSelling] = useState<SoldTarget | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, start] = useTransition();

  // Long press opens the item menu. A press that fired must not also follow the link.
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const startPress = (item: ClosetItem) => {
    longPressed.current = false;
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      navigator.vibrate?.(10);
      setMenuItem(item);
    }, 450);
  };
  const cancelPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
  };

  function changeView(next: "grid" | "table") {
    window.localStorage.setItem(VIEW_KEY, next);
    viewListeners.forEach((listener) => listener());
  }

  const options = useMemo(
    () => ({
      season: unique(items.flatMap((i) => i.seasons)),
      occasion: unique(items.flatMap((i) => i.occasions)),
      color: unique(items.flatMap((i) => [i.color, ...i.colors])),
      brand: unique(items.map((i) => i.brand)),
      status: [...ITEM_STATUSES] as string[],
      size: unique(items.map((i) => i.size)),
      tag: unique(items.flatMap((i) => i.tags)),
    }),
    [items],
  );

  const activeFilters =
    Object.values(filters).reduce((n, v) => n + (Array.isArray(v) ? v.length : v ? 1 : 0), 0);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (wanted: string[], values: (string | null)[]) => wanted.length === 0 || wanted.some((w) => values.includes(w));
    const filtered = items.filter((i) => {
      if (tab !== "All" && closetTab(i.category) !== tab) return false;
      if (filters.favorites && !i.favorite) return false;
      if (!matches(filters.season, i.seasons) || !matches(filters.occasion, i.occasions)) return false;
      if (!matches(filters.color, [i.color, ...i.colors]) || !matches(filters.brand, [i.brand])) return false;
      if (!matches(filters.status, [i.status]) || !matches(filters.size, [i.size]) || !matches(filters.tag, i.tags)) return false;
      if (q) {
        const haystack = [i.brand, i.name, i.color, i.size, i.category, i.subcategory, i.buy_source, i.storage_location, i.notes, ...i.tags].join(" ").toLowerCase();
        if (!q.split(/\s+/).every((word) => haystack.includes(word))) return false;
      }
      return true;
    });
    const sorters: Record<SortKey, (a: ClosetItem, b: ClosetItem) => number> = {
      newest: (a, b) => b.created_at.localeCompare(a.created_at),
      oldest: (a, b) => a.created_at.localeCompare(b.created_at),
      price_high: (a, b) => b.buy_price_chf - a.buy_price_chf,
      price_low: (a, b) => a.buy_price_chf - b.buy_price_chf,
      most_worn: (a, b) => b.wears.length - a.wears.length,
      brand: (a, b) => a.brand.localeCompare(b.brand),
    };
    return [...filtered].sort(sorters[sort]);
  }, [items, query, tab, filters, sort]);

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
  function toggleFilter(key: Exclude<keyof Filters, "favorites">, value: string) {
    setFilters((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }));
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

  function menuAction(action: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    start(async () => {
      const res = await action();
      setMessage(res.ok ? done : res.error);
      setMenuItem(null);
      setOutfitPicking(false);
    });
  }

  const today = localDate();
  const menuWornToday = menuItem?.wears.some((w) => w.worn_on === today) ?? false;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <h1 className="page-title">Closet</h1>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Select items" aria-pressed={selecting} className={iconButton} data-active={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
            <CheckSquare className="size-5" strokeWidth={1.5} />
          </button>
          <button type="button" aria-label="Grid view" aria-pressed={view === "grid"} className={iconButton} data-active={view === "grid"} onClick={() => changeView("grid")}>
            <LayoutGrid className="size-5" strokeWidth={1.5} />
          </button>
          <button type="button" aria-label="Table view" aria-pressed={view === "table"} className={iconButton} data-active={view === "table"} onClick={() => changeView("table")}>
            <Table2 className="size-5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label="Search closet" placeholder="Search" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button type="button" variant="outline" aria-label={`Filters${activeFilters ? `, ${activeFilters} active` : ""}`} onClick={() => setFilterOpen(true)}>
          <SlidersHorizontal /> {activeFilters > 0 ? <span className="num">{activeFilters}</span> : "Filter"}
        </Button>
      </div>

      <nav aria-label="Categories" className="no-scrollbar -mx-4 flex gap-5 overflow-x-auto border-b px-4 md:mx-0 md:px-0">
        {CLOSET_TABS.map((t) => (
          <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={cn("eyebrow -mb-px min-w-11 border-b-2 border-transparent py-2.5 whitespace-nowrap", tab === t && "border-foreground text-foreground")}>
            {t}
          </button>
        ))}
      </nav>

      {unwornCount > 0 && (
        <Link href="/insights" className="flex items-center justify-between rounded-lg bg-muted px-3 py-2.5 text-sm">
          <span><span className="num">{unwornCount}</span> not worn in 6+ months. Sell?</span>
          <span className="underline underline-offset-4">Review</span>
        </Link>
      )}

      {message && (
        <p role="status" className="flex items-center justify-between rounded-lg border border-foreground px-3 py-2 text-sm">
          {message}
          <button type="button" aria-label="Dismiss" onClick={() => setMessage(null)}><X className="size-4" /></button>
        </p>
      )}

      {visible.length === 0 ? (
        <div className="flex flex-col items-start gap-3 py-16">
          {items.length === 0 ? (
            <>
              <p className="page-title">Empty.</p>
              <Button asChild><Link href="/items/new">Add your first item</Link></Button>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">No items match.</p>
              <Button variant="outline" onClick={() => { setFilters(NO_FILTERS); setQuery(""); setTab("All"); }}>Clear filters</Button>
            </>
          )}
        </div>
      ) : view === "grid" ? (
        <ul className="grid grid-cols-2 gap-x-2 gap-y-6 md:grid-cols-3 xl:grid-cols-4">
          {visible.map((item) => {
            const image = primaryImage(item.item_images);
            const listing = openListing(item);
            const isSelected = selected.has(item.id);
            const cpw = costPerWear(item.buy_price_chf, item.wears.length);
            const body = (
              <>
                <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-muted">
                  {image ? (
                    <img src={image} alt={`${item.brand} ${item.name}`} loading="lazy" draggable={false} className={cn("size-full", imageFitClass(item.item_images), item.status === "sold" && "opacity-40")} />
                  ) : (
                    <span className="eyebrow grid size-full place-items-center">No photo</span>
                  )}
                  <span className="badge absolute top-2 left-2">{STATUS_LABEL[item.status]}</span>
                  {item.wears.length > 0 && (
                    <span className="badge num absolute bottom-2 left-2 normal-case">
                      {item.wears.length}× · {money(cpw)}/wear
                    </span>
                  )}
                  {selecting && (
                    <span aria-hidden className={cn("absolute top-2 right-2 grid size-7 place-items-center rounded-full border-2 border-foreground bg-background", isSelected && "bg-foreground text-background")}>
                      {isSelected && "✓"}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-col gap-0.5 text-left">
                  <span className="eyebrow truncate">{item.brand}</span>
                  <span className="truncate text-sm">{item.name}</span>
                  <span className="num text-sm">
                    {item.sales ? (
                      signedMoney(Number(item.sales.net_profit))
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
              <li key={item.id} className="relative flex min-w-0 flex-col select-none [-webkit-touch-callout:none]">
                {selecting ? (
                  <button type="button" aria-pressed={isSelected} className="min-w-0" onClick={() => toggle(item.id)}>{body}</button>
                ) : (
                  <Link
                    href={`/items/${item.id}`}
                    className="min-w-0"
                    draggable={false}
                    onPointerDown={() => startPress(item)}
                    onPointerUp={cancelPress}
                    onPointerLeave={cancelPress}
                    onPointerCancel={cancelPress}
                    onContextMenu={(e) => e.preventDefault()}
                    onClick={(e) => {
                      if (longPressed.current) e.preventDefault();
                    }}
                  >
                    {body}
                  </Link>
                )}
                {!selecting && (
                  <div className="absolute top-1 right-1 flex flex-col">
                    <button
                      type="button"
                      aria-label={item.favorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
                      aria-pressed={item.favorite}
                      className="grid size-10 place-items-center text-foreground"
                      onClick={() => start(async () => { await setFavorite(item.id, !item.favorite); })}
                    >
                      <Heart className="size-[18px] drop-shadow" strokeWidth={1.5} fill={item.favorite ? "currentColor" : "none"} />
                    </button>
                    <button type="button" aria-label={`More actions for ${item.name}`} className="grid size-10 place-items-center text-foreground" onClick={() => setMenuItem(item)}>
                      <MoreHorizontal className="size-[18px] drop-shadow" strokeWidth={1.5} />
                    </button>
                  </div>
                )}
                {/* A listed item stays two taps from sold: this button, then Confirm. */}
                {!selecting && item.status === "listed" && (
                  <Button type="button" variant="outline" size="sm" className="mt-2 w-full" onClick={() => setSelling(soldTarget(item))}>Sold</Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="-mx-4 overflow-x-auto md:mx-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="eyebrow border-b text-left">
                {selecting && <th className="w-10 p-2"><span className="sr-only">Select</span></th>}
                <th className="p-2 pl-4 font-normal md:pl-2">Item</th>
                <th className="p-2 font-normal">Status</th>
                <th className="p-2 text-right font-normal">Cost</th>
                <th className="p-2 text-right font-normal">List</th>
                <th className="p-2 text-right font-normal">Net</th>
                <th className="p-2 text-right font-normal">Wears</th>
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
                        <input type="checkbox" className="size-6 accent-foreground" aria-label={`Select ${item.name}`} checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                      </td>
                    )}
                    <td className="p-2 pl-4 md:pl-2">
                      <Link href={`/items/${item.id}`} className="flex items-center gap-3">
                        <span className="block h-14 w-[42px] shrink-0 overflow-hidden rounded-md bg-muted">
                          {image && <img src={image} alt="" loading="lazy" className={cn("size-full", imageFitClass(item.item_images))} />}
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
                    <td className="num p-2 text-right">{item.wears.length}</td>
                    <td className="num p-2 text-right">{listing ? daysBetween(listing.listed_at, today) : "—"}</td>
                    <td className="p-2 text-right">
                      {item.status !== "sold" && <Button type="button" variant="outline" size="sm" onClick={() => setSelling(soldTarget(item))}>Sold</Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selecting && (
        <div className="pb-safe fixed inset-x-0 bottom-16 z-40 border-t bg-background p-3 md:bottom-0 md:left-56">
          <div className="mx-auto flex max-w-6xl flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="num">{selected.size} selected</span>
              <button type="button" className="py-1 underline underline-offset-4" onClick={() => setSelected(new Set(visible.map((i) => i.id)))}>Select all {visible.length}</button>
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

      {/* Filter sheet */}
      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="sheet">
          <DialogHeader className="text-left">
            <DialogTitle>Filter</DialogTitle>
            <DialogDescription className="num">{visible.length} of {items.length} items</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[65dvh] flex-col gap-5 overflow-y-auto">
            <button type="button" className="chip shrink-0 self-start" data-active={filters.favorites} aria-pressed={filters.favorites} onClick={() => setFilters((f) => ({ ...f, favorites: !f.favorites }))}>
              <Heart className="mr-1.5 size-3.5" /> Favorites
            </button>
            {([["status", "Status"], ["season", "Season"], ["occasion", "Occasion"], ["color", "Color"], ["brand", "Brand"], ["size", "Size"], ["tag", "Tags"]] as const).map(([key, label]) =>
              options[key].length === 0 ? null : (
                <fieldset key={key}>
                  <legend className="eyebrow mb-2">{label}</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {options[key].map((value) => (
                      <button key={value} type="button" className="chip" data-active={filters[key].includes(value)} aria-pressed={filters[key].includes(value)} onClick={() => toggleFilter(key, value)}>
                        {key === "status" ? STATUS_LABEL[value as ItemStatus] : value}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ),
            )}
            <div>
              <label htmlFor="closet-sort" className="eyebrow mb-2 block">Sort</label>
              <select id="closet-sort" className="field" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="most_worn">Most worn</option>
                <option value="price_high">Cost: high to low</option>
                <option value="price_low">Cost: low to high</option>
                <option value="brand">Brand A–Z</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => setFilters(NO_FILTERS)}>Clear</Button>
            <Button type="button" onClick={() => setFilterOpen(false)}>Show {visible.length}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Long-press menu */}
      <Dialog open={!!menuItem} onOpenChange={(open) => { if (!open) { setMenuItem(null); setOutfitPicking(false); } }}>
        <DialogContent className="sheet">
          <DialogHeader className="text-left">
            <DialogTitle>{menuItem?.name}</DialogTitle>
            <DialogDescription>{menuItem?.brand}</DialogDescription>
          </DialogHeader>
          {menuItem && outfitPicking ? (
            <div className="flex flex-col gap-2">
              {outfits.map((outfit) => (
                <Button key={outfit.id} type="button" variant="outline" disabled={pending} className="justify-start" onClick={() => menuAction(() => addToOutfit(outfit.id, menuItem.id), `Added to ${outfit.name}.`)}>
                  {outfit.name}
                </Button>
              ))}
              <Button type="button" variant="outline" className="justify-start" onClick={() => router.push(`/outfits?with=${menuItem.id}`)}>New outfit</Button>
            </div>
          ) : menuItem ? (
            <div className="flex flex-col gap-2">
              {menuItem.status !== "sold" && (
                <Button type="button" variant="outline" disabled={pending} className="justify-start" onClick={() => menuAction(() => logWear(menuItem.id, today), menuWornToday ? "Wear removed." : "Wear logged.")}>
                  {menuWornToday ? "Remove today's wear" : "Log wear today"}
                </Button>
              )}
              <Button type="button" variant="outline" disabled={pending} className="justify-start" onClick={() => menuAction(() => setFavorite(menuItem.id, !menuItem.favorite), menuItem.favorite ? "Removed from favorites." : "Added to favorites.")}>
                {menuItem.favorite ? "Remove from favorites" : "Favorite"}
              </Button>
              {menuItem.status !== "sold" && <Button type="button" variant="outline" className="justify-start" onClick={() => setOutfitPicking(true)}>Add to outfit</Button>}
              {(menuItem.status === "in_stock" || menuItem.status === "personal") && (
                <Button type="button" variant="outline" disabled={pending} className="justify-start" onClick={() => menuAction(() => bulkSetStatus([menuItem.id], "listed"), "Marked as listed. Add its platform and price on the item page.")}>
                  Mark listed
                </Button>
              )}
              {menuItem.status !== "sold" && (
                <Button type="button" variant="outline" className="justify-start" onClick={() => { setSelling(soldTarget(menuItem)); setMenuItem(null); }}>Mark sold</Button>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <SoldDialog target={selling} platforms={platforms} onClose={() => setSelling(null)} />
    </div>
  );
}
