"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tradeItem } from "@/lib/actions/sales";
import { localDate, money } from "@/lib/format";
import { tradeCost } from "@/lib/metrics";
import { CATEGORIES } from "@/lib/types";

export interface TradeTarget {
  id: string;
  brand: string;
  name: string;
  category: string | null;
  buy_price_chf: number;
  status: string;
}

type Cash = "none" | "paid" | "received";

export function TradeDialog({ target, onClose }: { target: TradeTarget | null; onClose: () => void }) {
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sheet">
        {/* Keyed, so each trade starts with a clean form. */}
        {target && <TradeForm key={target.id} target={target} />}
      </DialogContent>
    </Dialog>
  );
}

function TradeForm({ target }: { target: TradeTarget }) {
  const router = useRouter();
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState(target.category ?? "");
  const [size, setSize] = useState("");
  const [keepAs, setKeepAs] = useState<"personal" | "in_stock">(target.status === "personal" ? "personal" : "in_stock");
  const [cash, setCash] = useState<Cash>("none");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localDate());
  const [ship, setShip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const cashAmount = cash === "none" ? 0 : Number(amount) || 0;
  const cost = tradeCost(target.buy_price_chf, cash === "paid" ? cashAmount : 0, cash === "received" ? cashAmount : 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await tradeItem({
        item_id: target.id,
        brand,
        name,
        category: category || null,
        size: size || null,
        status: keepAs,
        cash_paid: cash === "paid" ? cashAmount : 0,
        cash_received: cash === "received" ? cashAmount : 0,
        traded_at: date,
        needs_shipping: ship,
      });
      if (!res.ok) return setError(res.error);
      // Straight to the new item, to add its photos.
      router.push(`/items/${res.data.id}`);
    });
  }

  return (
    <>
      <DialogHeader className="text-left">
        <DialogTitle>Traded</DialogTitle>
        <DialogDescription>
          {target.brand} · {target.name}. What did you get for it?
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="trade-brand">Brand</Label>
            <Input id="trade-brand" autoCapitalize="words" value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="trade-name">Name</Label>
            <Input id="trade-name" autoCapitalize="sentences" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="trade-category">Category</Label>
            <select id="trade-category" className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">None</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="trade-size">Size</Label>
            <Input id="trade-size" value={size} onChange={(e) => setSize(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm leading-none font-medium">Money on top</span>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Money on top">
            {([["none", "None"], ["paid", "I paid"], ["received", "I got"]] as const).map(([value, label]) => (
              <button key={value} type="button" className="chip justify-center" data-active={cash === value} aria-pressed={cash === value} onClick={() => setCash(value)}>
                {label}
              </button>
            ))}
          </div>
          {cash !== "none" && (
            <Input aria-label={cash === "paid" ? "Amount you paid, CHF" : "Amount you got, CHF"} inputMode="decimal" className="num" placeholder="CHF" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm leading-none font-medium">Keep it as</span>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Keep it as">
            <button type="button" className="chip justify-center" data-active={keepAs === "personal"} aria-pressed={keepAs === "personal"} onClick={() => setKeepAs("personal")}>Personal</button>
            <button type="button" className="chip justify-center" data-active={keepAs === "in_stock"} aria-pressed={keepAs === "in_stock"} onClick={() => setKeepAs("in_stock")}>In stock</button>
          </div>
        </div>

        <div className="grid grid-cols-2 items-end gap-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="trade-date">Date</Label>
            <Input id="trade-date" type="date" className="num" value={date} max={localDate()} onChange={(e) => setDate(e.target.value)} />
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5 accent-foreground" checked={ship} onChange={(e) => setShip(e.target.checked)} />
            I still need to ship mine
          </label>
        </div>

        <p className="text-sm text-muted-foreground">
          The new piece counts as costing <span className="num text-foreground">CHF {money(cost)}</span>, what yours cost{cash === "paid" ? " plus what you paid" : cash === "received" ? " minus what you got" : ""}. A trade isn&apos;t counted as a sale, so your profit shows when you sell what you got.
        </p>

        {error && <p role="alert" className="text-sm font-medium">{error}</p>}
        <Button type="submit" size="lg" disabled={pending}>{pending ? "Saving…" : "Save trade"}</Button>
      </form>
    </>
  );
}
