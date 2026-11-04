"use client";

import { useMemo, useState } from "react";
import { CompHint } from "@/components/comp-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/format";
import { feeFor, maxBuyPrice, type CompRow } from "@/lib/metrics";
import { CATEGORIES, type Platform } from "@/lib/types";

export function CalculatorView({ platforms, comps }: { platforms: Platform[]; comps: CompRow[] }) {
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [sale, setSale] = useState("");
  const [roi, setRoi] = useState("50");
  const [shipping, setShipping] = useState("");
  const [platformId, setPlatformId] = useState(platforms[0]?.id ?? "");

  const brands = useMemo(() => [...new Set(comps.map((c) => c.brand))].sort((a, b) => a.localeCompare(b)), [comps]);
  const platform = platforms.find((p) => p.id === platformId);
  const salePrice = Number(sale) || 0;
  const fee = feeFor(platform, salePrice);
  const shippingCost = Number(shipping) || 0;
  const targetRoi = Number(roi) || 0;
  const maxBuy = maxBuyPrice(salePrice, fee, shippingCost, targetRoi / 100);
  const breakEven = maxBuyPrice(salePrice, fee, shippingCost, 0);
  const profit = Math.max(0, breakEven - maxBuy);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <div>
        <h1 className="page-title">Max buy</h1>
        <p className="mt-2 text-sm text-muted-foreground">The most you can pay and still hit your target return.</p>
      </div>

      <section aria-live="polite">
        <p className="eyebrow">Pay up to, CHF</p>
        <p className="num mt-1 text-6xl leading-none tracking-tight">{money(maxBuy)}</p>
        {salePrice > 0 && (
          <dl className="num mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Fees</dt><dd className="text-right">{money(fee)}</dd>
            <dt className="text-muted-foreground">Profit at that price</dt><dd className="text-right">{money(profit)}</dd>
            <dt className="text-muted-foreground">Break-even price</dt><dd className="text-right">{money(breakEven)}</dd>
          </dl>
        )}
      </section>

      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="calc-sale">Expected sale price</Label>
            <Input id="calc-sale" inputMode="decimal" className="num" value={sale} onChange={(e) => setSale(e.target.value.replace(",", "."))} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="calc-roi">Target ROI, %</Label>
            <Input id="calc-roi" inputMode="decimal" className="num" value={roi} onChange={(e) => setRoi(e.target.value.replace(",", "."))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="calc-platform">Platform</Label>
            <select id="calc-platform" className="field" value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
              {platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="calc-shipping">Shipping you pay</Label>
            <Input id="calc-shipping" inputMode="decimal" className="num" placeholder="0" value={shipping} onChange={(e) => setShipping(e.target.value.replace(",", "."))} />
          </div>
        </div>

        <fieldset className="flex flex-col gap-2 border-t pt-4">
          <legend className="eyebrow mb-2">Estimate from your past sales</legend>
          <div className="grid grid-cols-2 gap-2">
            <select aria-label="Brand" className="field min-w-0" value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">Any brand</option>
              {brands.map((b) => <option key={b}>{b}</option>)}
            </select>
            <select aria-label="Category" className="field min-w-0" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Any category</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          {(brand || category) && <CompHint rows={comps} brand={brand} category={category || null} onUse={(price) => setSale(String(price))} />}
        </fieldset>
      </form>
    </div>
  );
}
