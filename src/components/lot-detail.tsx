"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assignToLot, deleteLot, updateLot } from "@/lib/actions/business";
import { imageFitClass, money, primaryImage, signedMoney } from "@/lib/format";
import { lotSummary } from "@/lib/metrics";
import { STATUS_LABEL, type ItemStatus } from "@/lib/types";

export interface LotCandidate {
  id: string;
  brand: string;
  name: string;
  status: ItemStatus;
}

export interface LotDetailData {
  id: string;
  name: string;
  total_cost_chf: number;
  bought_at: string | null;
  source: string | null;
  items: (LotCandidate & {
    buy_price_chf: number;
    item_images: { url: string; is_primary: boolean; position: number; cutout_url: string | null }[];
    sales: { sale_price: number; net_profit: number } | null;
  })[];
}

export function LotDetail({ lot, candidates }: { lot: LotDetailData; candidates: LotCandidate[] }) {
  const router = useRouter();
  const [name, setName] = useState(lot.name);
  const [cost, setCost] = useState(String(lot.total_cost_chf));
  const [date, setDate] = useState(lot.bought_at ?? "");
  const [source, setSource] = useState(lot.source ?? "");
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const summary = lotSummary(lot.items);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, ok?: string, then?: () => void) {
    setMessage(null);
    start(async () => {
      const res = await action();
      if (!res.ok) return setMessage(res.error);
      if (ok) setMessage(ok);
      then?.();
    });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div>
        <p className="eyebrow"><Link href="/lots" className="inline-block py-1.5">Lots</Link></p>
        <h1 className="page-title mt-2">{lot.name}</h1>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-4">
        {([
          ["Total cost", money(Number(lot.total_cost_chf))],
          ["Sold", `${summary.sold} of ${summary.count}`],
          ["Revenue", money(summary.revenue)],
          ["Profit so far", signedMoney(summary.profit)],
        ] as const).map(([label, value]) => (
          <div key={label} className="border-t pt-2">
            <dt className="eyebrow">{label}</dt>
            <dd className="num mt-1 text-xl">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">
        {summary.recovered >= Number(lot.total_cost_chf)
          ? "This lot has paid for itself."
          : <><span className="num">{money(Number(lot.total_cost_chf) - summary.recovered)}</span> left to recover from sales.</>}
      </p>

      <section>
        <h2 className="eyebrow border-b pb-2">Items, each with an equal share of the cost</h2>
        {lot.items.length === 0 && <p className="py-4 text-sm text-muted-foreground">No items yet. Add some to split the cost.</p>}
        <ul>
          {lot.items.map((item) => {
            const image = primaryImage(item.item_images);
            return (
              <li key={item.id} className="flex items-center gap-3 border-b py-2">
                <Link href={`/items/${item.id}`} aria-label={item.name} className="block h-14 w-[42px] shrink-0 overflow-hidden rounded-md bg-muted">
                  {image && <img src={image} alt="" loading="lazy" className={`size-full ${imageFitClass(item.item_images)}`} />}
                </Link>
                <Link href={`/items/${item.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{item.brand} · {item.name}</span>
                  <span className="block text-xs text-muted-foreground">{STATUS_LABEL[item.status]}</span>
                </Link>
                <span className="num text-right text-sm">
                  {money(item.buy_price_chf)}
                  {item.sales && <span className="block text-xs text-muted-foreground">{signedMoney(Number(item.sales.net_profit))}</span>}
                </span>
                <button type="button" aria-label={`Remove ${item.name} from lot`} disabled={pending} className="grid size-9 place-items-center text-muted-foreground" onClick={() => run(() => assignToLot(null, [item.id]))}>
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">A removed item keeps its current cost until you edit it.</p>

        {picking ? (
          <div className="mt-4 flex flex-col gap-2">
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No unsold items are free to add.</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto rounded-lg border">
                {candidates.map((c) => (
                  <li key={c.id} className="border-b last:border-b-0">
                    <label className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-5 accent-foreground"
                        checked={picked.has(c.id)}
                        onChange={() =>
                          setPicked((prev) => {
                            const next = new Set(prev);
                            if (next.has(c.id)) next.delete(c.id);
                            else next.add(c.id);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 truncate">{c.brand} · {c.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">Adding an item replaces its current cost with its share of this lot.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                disabled={pending || picked.size === 0}
                onClick={() => run(() => assignToLot(lot.id, [...picked]), undefined, () => { setPicked(new Set()); setPicking(false); })}
              >
                Add {picked.size || ""}
              </Button>
              <Button type="button" variant="outline" onClick={() => setPicking(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="outline" className="mt-4 w-full" onClick={() => setPicking(true)}>Add items</Button>
        )}
      </section>

      <form
        className="flex flex-col gap-3 border-t pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (cost === "" || !(Number(cost) >= 0)) return setMessage("Enter the total cost");
          run(() => updateLot(lot.id, { name, total_cost_chf: Number(cost), bought_at: date, source }), "Saved.");
        }}
      >
        <h2 className="eyebrow">Details</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lot-name">Name</Label>
          <Input id="lot-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="lot-cost">Total cost, CHF</Label>
            <Input id="lot-cost" inputMode="decimal" className="num" value={cost} onChange={(e) => setCost(e.target.value.replace(",", "."))} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="lot-date">Bought on</Label>
            <Input id="lot-date" type="date" className="num" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lot-source">Bought from</Label>
          <Input id="lot-source" value={source} onChange={(e) => setSource(e.target.value)} />
        </div>
        {message && <p role="status" className="text-sm">{message}</p>}
        <Button type="submit" variant="outline" disabled={pending}>Save details</Button>
      </form>

      <div className="text-sm">
        {confirmDelete ? (
          <span className="flex items-center gap-3">
            <button type="button" className="font-medium underline underline-offset-4" disabled={pending} onClick={() => run(() => deleteLot(lot.id), undefined, () => router.push("/lots"))}>
              Delete lot, keep its items
            </button>
            <button type="button" className="text-muted-foreground" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </span>
        ) : (
          <button type="button" className="py-1.5 text-muted-foreground underline underline-offset-4" onClick={() => setConfirmDelete(true)}>Delete lot</button>
        )}
      </div>
    </div>
  );
}
