"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { bulkSetStatus } from "@/lib/actions/items";
import { logWear } from "@/lib/actions/wardrobe";
import { imageFitClass, localDate, money, primaryImage, shortDate } from "@/lib/format";
import { costPerWear, isUnworn } from "@/lib/metrics";

export interface WardrobeItem {
  id: string;
  brand: string;
  name: string;
  buy_price_chf: number;
  buy_date: string | null;
  created_at: string;
  item_images: { url: string; is_primary: boolean; position: number; cutout_url: string | null }[];
  wears: { worn_on: string }[];
}

function lastWorn(item: WardrobeItem): string | null {
  return item.wears.map((w) => w.worn_on).sort().at(-1) ?? null;
}

export function WardrobeView({ items }: { items: WardrobeItem[] }) {
  const today = localDate();
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  // A wear shows immediately on tap; the server confirms behind it.
  const [optimistic, toggleOptimistic] = useOptimistic(items, (state, id: string) =>
    state.map((item) => {
      if (item.id !== id) return item;
      const worn = item.wears.some((w) => w.worn_on === today);
      return { ...item, wears: worn ? item.wears.filter((w) => w.worn_on !== today) : [...item.wears, { worn_on: today }] };
    }),
  );

  function tapWorn(id: string) {
    setError(null);
    start(async () => {
      toggleOptimistic(id);
      const res = await logWear(id, today);
      if (!res.ok) setError(res.error);
    });
  }

  function moveToStock(id: string) {
    setError(null);
    start(async () => {
      const res = await bulkSetStatus([id], "in_stock");
      if (!res.ok) setError(res.error);
    });
  }

  const sorted = useMemo(
    () => [...optimistic].sort((a, b) => (lastWorn(b) ?? "").localeCompare(lastWorn(a) ?? "") || a.brand.localeCompare(b.brand)),
    [optimistic],
  );
  const unworn = optimistic.filter((i) => isUnworn(lastWorn(i), i.buy_date ?? i.created_at, today));
  const totalWears = optimistic.reduce((sum, i) => sum + i.wears.length, 0);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-end justify-between gap-4">
        <h1 className="page-title">Wardrobe</h1>
        <p className="num text-right text-xs text-muted-foreground">{optimistic.length} pieces<br />{totalWears} wears</p>
      </header>

      {error && <p role="alert" className="border border-foreground px-3 py-2 text-sm font-medium">{error}</p>}

      {unworn.length > 0 && (
        <section>
          <h2 className="eyebrow border-b pb-2">Not worn in 6+ months. Sell?</h2>
          <ul>
            {unworn.map((item) => {
              const last = lastWorn(item);
              return (
                <li key={item.id} className="flex items-center gap-3 border-b py-2">
                  <Link href={`/items/${item.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{item.brand} · {item.name}</span>
                    <span className="num block text-xs text-muted-foreground">{last ? `Last worn ${shortDate(last)}` : "Never worn"}</span>
                  </Link>
                  <Button size="sm" variant="outline" onClick={() => moveToStock(item.id)}>Move to stock</Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {sorted.length === 0 ? (
        <p className="py-12 text-muted-foreground">Items you keep for yourself appear here. Choose Personal when adding an item.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-2 gap-y-6 md:grid-cols-3 lg:grid-cols-4">
          {sorted.map((item) => {
            const image = primaryImage(item.item_images);
            const wornToday = item.wears.some((w) => w.worn_on === today);
            const cpw = costPerWear(item.buy_price_chf, item.wears.length);
            return (
              <li key={item.id} className="flex min-w-0 flex-col">
                <Link href={`/items/${item.id}`}>
                  <div className="aspect-[3/4] overflow-hidden rounded-lg bg-muted">
                    {image ? <img src={image} alt={`${item.brand} ${item.name}`} loading="lazy" className={`size-full ${imageFitClass(item.item_images)}`} /> : <span className="eyebrow grid size-full place-items-center">No photo</span>}
                  </div>
                  <p className="eyebrow mt-2 truncate">{item.brand}</p>
                  <p className="truncate text-sm">{item.name}</p>
                  <p className="num text-xs text-muted-foreground">
                    {item.wears.length} wears · {cpw === null ? "no wears yet" : `${money(cpw)}/wear`}
                  </p>
                </Link>
                <Button type="button" size="sm" variant={wornToday ? "default" : "outline"} aria-pressed={wornToday} className="mt-2 w-full" onClick={() => tapWorn(item.id)}>
                  {wornToday ? "Worn today ✓" : "Worn today"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
