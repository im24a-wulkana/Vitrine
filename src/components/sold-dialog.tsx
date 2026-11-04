"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordSale } from "@/lib/actions/sales";
import { localDate, money, signedMoney } from "@/lib/format";
import { feeFor, netProfit } from "@/lib/metrics";
import type { Platform } from "@/lib/types";

export interface SoldTarget {
  id: string;
  brand: string;
  name: string;
  buy_price_chf: number;
  /** From the open listing, so a listed item sells in two taps. */
  platform?: string | null;
  list_price?: number | null;
}

interface Props {
  target: SoldTarget | null;
  platforms: Platform[];
  onClose: () => void;
}

function numberOf(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function SoldDialog({ target, platforms, onClose }: Props) {
  const [platform, setPlatform] = useState("");
  const [price, setPrice] = useState("");
  const [fees, setFees] = useState("");
  const [feesEdited, setFeesEdited] = useState(false);
  const [shipping, setShipping] = useState("");
  const [soldAt, setSoldAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!target) return;
    const known = platforms.find((p) => p.name === target.platform);
    const chosen = known?.name ?? platforms[0]?.name ?? "";
    const startPrice = target.list_price ?? null;
    setPlatform(chosen);
    setPrice(startPrice !== null ? String(startPrice) : "");
    setFees(startPrice !== null ? String(feeFor(platforms.find((p) => p.name === chosen), Number(startPrice))) : "");
    setFeesEdited(false);
    setShipping("");
    setSoldAt(localDate());
    setError(null);
  }, [target, platforms]);

  // The fee preset follows platform and price until the user types their own.
  function recalc(nextPlatform: string, nextPrice: string) {
    if (feesEdited) return;
    const fee = feeFor(platforms.find((p) => p.name === nextPlatform), numberOf(nextPrice));
    setFees(nextPrice ? String(fee) : "");
  }

  const preset = platforms.find((p) => p.name === platform);
  const net = target ? netProfit(numberOf(price), numberOf(fees), numberOf(shipping), Number(target.buy_price_chf)) : 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    if (price === "" || !(Number(price) >= 0)) return setError("Enter the sale price");
    setError(null);
    start(async () => {
      const res = await recordSale({
        item_id: target.id,
        platform,
        sale_price: Number(price),
        fees: numberOf(fees),
        shipping_cost: numberOf(shipping),
        sold_at: soldAt,
      });
      if (!res.ok) return setError(res.error);
      onClose();
    });
  }

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sheet">
        <DialogHeader className="text-left">
          <DialogTitle>Mark as sold</DialogTitle>
          <DialogDescription>{target?.brand} · {target?.name}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm leading-none font-medium">Platform</span>
            <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
              {platforms.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="chip"
                  data-active={platform === p.name}
                  aria-pressed={platform === p.name}
                  onClick={() => {
                    setPlatform(p.name);
                    recalc(p.name, price);
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
            {platforms.length === 0 && <p className="text-sm text-muted-foreground">Add a platform in Settings first.</p>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sale-price">Sold for</Label>
              <Input
                id="sale-price"
                inputMode="decimal"
                className="num"
                value={price}
                onChange={(e) => {
                  const v = e.target.value.replace(",", ".");
                  setPrice(v);
                  recalc(platform, v);
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sale-fees">Fees</Label>
              <Input
                id="sale-fees"
                inputMode="decimal"
                className="num"
                value={fees}
                onChange={(e) => {
                  setFeesEdited(true);
                  setFees(e.target.value.replace(",", "."));
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sale-shipping">Shipping</Label>
              <Input id="sale-shipping" inputMode="decimal" className="num" placeholder="0" value={shipping} onChange={(e) => setShipping(e.target.value.replace(",", "."))} />
            </div>
          </div>
          {preset && (
            <p className="num text-xs text-muted-foreground">
              {feesEdited ? "Fee entered by hand" : `Preset: ${Number(preset.fee_percent)}% + ${money(Number(preset.fee_fixed))}`}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sale-date">Sold on</Label>
            <Input id="sale-date" type="date" className="num" value={soldAt} onChange={(e) => setSoldAt(e.target.value)} />
          </div>

          <div className="border-t pt-3" aria-live="polite">
            <div className="flex items-baseline justify-between">
              <span className="eyebrow">Net profit</span>
              <span className="num text-3xl">{signedMoney(net)}</span>
            </div>
            <p className="num mt-1 text-right text-xs text-muted-foreground">after {money(Number(target?.buy_price_chf ?? 0))} cost</p>
          </div>

          {error && <p role="alert" className="text-sm font-medium">{error}</p>}
          <Button type="submit" size="lg" disabled={pending || !platform}>
            {pending ? "Saving…" : "Confirm sale"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
