"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CompHint } from "@/components/comp-hint";
import { SoldDialog, type SoldTarget } from "@/components/sold-dialog";
import { TradeDialog, type TradeTarget } from "@/components/trade-dialog";
import { bulkSetStatus, deleteItems } from "@/lib/actions/items";
import { closeListing, createListing, undoSale, updateListingPrice } from "@/lib/actions/sales";
import { logWear } from "@/lib/actions/wardrobe";
import { localDate } from "@/lib/format";
import type { CompRow } from "@/lib/metrics";
import type { Item, Listing, Platform } from "@/lib/types";

interface Props {
  item: Item & { wears: { worn_on: string }[] };
  listings: Listing[];
  platforms: Platform[];
  comps: CompRow[];
}

export function ItemActions({ item, listings, platforms, comps }: Props) {
  const router = useRouter();
  const [selling, setSelling] = useState<SoldTarget | null>(null);
  const [trading, setTrading] = useState<TradeTarget | null>(null);
  const [listingOpen, setListingOpen] = useState(false);
  const [platform, setPlatform] = useState(platforms[0]?.name ?? "");
  const [price, setPrice] = useState("");
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = listings.filter((l) => !l.delisted_at);
  const sold = item.status === "sold";
  const traded = (item as { sales?: { kind?: string } | null }).sales?.kind === "trade";
  const wornToday = item.wears.some((w) => w.worn_on === localDate());

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, then?: () => void) {
    setError(null);
    start(async () => {
      const res = await action();
      if (!res.ok) return setError(res.error);
      then?.();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      {!sold && (
        <Button
          size="lg"
          onClick={() =>
            setSelling({
              id: item.id,
              brand: item.brand,
              name: item.name,
              buy_price_chf: item.buy_price_chf,
              platform: open[0]?.platform,
              list_price: open[0]?.list_price,
            })
          }
        >
          Mark as sold
        </Button>
      )}
      {!sold && (
        <Button
          type="button"
          size="lg"
          variant="outline"
          onClick={() => setTrading({ id: item.id, brand: item.brand, name: item.name, category: item.category, buy_price_chf: item.buy_price_chf, status: item.status })}
        >
          Traded
        </Button>
      )}

      {open.map((l) => (
        <div key={l.id} className="flex flex-col gap-2 border p-3">
          <p className="eyebrow">Listed on {l.platform}</p>
          {editingPrice === l.id ? (
            <form
              className="grid grid-cols-[1fr_auto] gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const next = Number(price);
                if (price === "" || !(next >= 0)) return setError("Enter a valid price");
                run(() => updateListingPrice(l.id, next), () => setEditingPrice(null));
              }}
            >
              <Input aria-label="New price" inputMode="decimal" className="num" autoFocus value={price} onChange={(e) => setPrice(e.target.value.replace(",", "."))} />
              <Button type="submit" disabled={pending}>Save</Button>
              <div className="col-span-2"><CompHint rows={comps} brand={item.brand} category={item.category} onUse={(p) => setPrice(String(p))} /></div>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={() => { setPrice(l.list_price === null ? "" : String(l.list_price)); setEditingPrice(l.id); }}>
                Change price
              </Button>
              <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => closeListing(l.id))}>
                End listing
              </Button>
            </div>
          )}
        </div>
      ))}

      {!sold &&
        (listingOpen ? (
          <form
            className="grid grid-cols-[1fr_6rem_auto] gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => createListing({ item_id: item.id, platform, list_price: price ? Number(price) : null }),
                () => { setListingOpen(false); setPrice(""); },
              );
            }}
          >
            <select aria-label="Platform" className="field min-w-0" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {platforms.map((p) => <option key={p.id}>{p.name}</option>)}
            </select>
            <Input aria-label="List price" inputMode="decimal" placeholder="Price" className="num" value={price} onChange={(e) => setPrice(e.target.value.replace(",", "."))} />
            <Button type="submit" disabled={pending}>List</Button>
            <div className="col-span-3"><CompHint rows={comps} brand={item.brand} category={item.category} onUse={(p) => setPrice(String(p))} /></div>
          </form>
        ) : (
          <Button type="button" variant="outline" onClick={() => { setPrice(""); setListingOpen(true); }}>
            {open.length ? "List on another platform" : "List for sale"}
          </Button>
        ))}

      {!sold && (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" disabled={pending} aria-pressed={wornToday} onClick={() => run(() => logWear(item.id, localDate()))}>
            {wornToday ? "Worn today ✓" : "Worn today"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => bulkSetStatus([item.id], item.status === "personal" ? "in_stock" : "personal"))}
          >
            {item.status === "personal" ? "Move to stock" : "Keep for myself"}
          </Button>
        </div>
      )}

      {sold && (
        <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => undoSale(item.id), () => router.refresh())}>
          {traded ? "Undo trade" : "Undo sale"}
        </Button>
      )}

      <div className="flex items-center justify-between gap-4 text-sm">
        <Link href={`/items/${item.id}/edit`} className="py-1.5 underline underline-offset-4">Edit details and photos</Link>
        {confirmDelete ? (
          <span className="flex items-center gap-3">
            <button type="button" className="font-medium underline underline-offset-4" disabled={pending} onClick={() => run(() => deleteItems([item.id]), () => router.push("/closet"))}>
              Delete permanently
            </button>
            <button type="button" className="text-muted-foreground" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </span>
        ) : (
          <button type="button" className="py-1.5 text-muted-foreground underline underline-offset-4" onClick={() => setConfirmDelete(true)}>Delete</button>
        )}
      </div>

      {error && <p role="alert" className="text-sm font-medium">{error}</p>}
      <SoldDialog target={selling} platforms={platforms} onClose={() => setSelling(null)} />
      <TradeDialog target={trading} onClose={() => setTrading(null)} />
    </section>
  );
}
