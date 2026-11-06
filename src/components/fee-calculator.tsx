"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { estimateFees } from "@/lib/fees";
import { money } from "@/lib/format";
import type { Platform } from "@/lib/types";

const SOURCES = [
  { label: "Ricardo", href: "https://help.ricardo.ch/hc/de/articles/360000171809-Wie-hoch-ist-die-Erfolgsprovision-beim-Verkauf-auf-Ricardo", note: "12% for fashion, 8 to 12% elsewhere, CHF 290 cap. Discounts of up to 30% aren't included." },
  { label: "Vestiaire Collective", href: "https://faq.vestiairecollective.com/hc/en-gb/articles/24659638721425-Seller-Selling-Fees", note: "CHF rates from 15 October 2026." },
  { label: "Vinted", href: "https://www.vinted.com/pricelist", note: "No sales commission listed. The buyer pays Vinted's fee at checkout. Swiss price list not checked." },
  { label: "Depop", href: "https://depophelp.zendesk.com/hc/en-gb/articles/360001791127-Seller-fees-and-charges", note: "10% outside the UK, US and Australia, plus PayPal." },
  { label: "Grailed", href: "https://www.voolist.com/blog/grailed-fees-2026", note: "International rate from a third-party guide. Grailed's own page wasn't readable." },
  { label: "Tutti", href: "https://www.pctipp.ch/themen/news/tutti-ricardo-co-so-verkaufen-richtig", note: "No commission, from an older third-party article." },
];

export function FeeCalculator({ platforms }: { platforms: Platform[] }) {
  const [sale, setSale] = useState("");
  const [cost, setCost] = useState("");
  const [shipping, setShipping] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const price = Number(sale) || 0;
  const costs = (Number(cost) || 0) + (Number(shipping) || 0);
  const rows = useMemo(
    () => platforms.map((platform) => ({ platform, estimate: estimateFees(platform, price) })).sort((a, b) => b.estimate.net - a.estimate.net),
    [platforms, price],
  );

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <div>
        <h1 className="page-title">Fees</h1>
        <p className="mt-2 text-sm text-muted-foreground">What you keep from a sale on each platform, best first.</p>
      </div>

      <form className="grid grid-cols-3 gap-2" onSubmit={(e) => e.preventDefault()}>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="fee-sale">Sale price, CHF</Label>
          <Input id="fee-sale" inputMode="decimal" className="num" value={sale} onChange={(e) => setSale(e.target.value.replace(",", "."))} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="fee-cost">You paid</Label>
          <Input id="fee-cost" inputMode="decimal" className="num" placeholder="0" value={cost} onChange={(e) => setCost(e.target.value.replace(",", "."))} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="fee-shipping">Shipping</Label>
          <Input id="fee-shipping" inputMode="decimal" className="num" placeholder="0" value={shipping} onChange={(e) => setShipping(e.target.value.replace(",", "."))} />
        </div>
      </form>

      <section aria-live="polite" aria-label="Fees by platform">
        <div className="eyebrow grid grid-cols-[1fr_5rem_5rem] gap-2 border-b pb-2">
          <span>Platform</span>
          <span className="text-right">Fees</span>
          <span className="text-right">{costs > 0 ? "Profit" : "You keep"}</span>
        </div>
        <ul>
          {rows.map(({ platform, estimate }) => (
            <li key={platform.id} className="border-b">
              <button
                type="button"
                className="num grid w-full grid-cols-[1fr_5rem_5rem] gap-2 py-3 text-left text-sm"
                aria-expanded={open === platform.id}
                onClick={() => setOpen(open === platform.id ? null : platform.id)}
              >
                <span className="min-w-0 truncate font-sans">{platform.name}</span>
                <span className="text-right text-muted-foreground">{money(estimate.total)}</span>
                <span className="text-right font-medium">{money(estimate.net - costs)}</span>
              </button>
              {open === platform.id && (
                <div className="pb-3 text-xs text-muted-foreground">
                  {estimate.lines.length > 0 && (
                    <dl className="num grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                      {estimate.lines.map((line) => (
                        <div key={line.label} className="contents">
                          <dt className="font-sans">{line.label}</dt>
                          <dd className="text-right">{money(line.amount)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <p className={estimate.lines.length > 0 ? "mt-2" : ""}>
                    {estimate.basis === "settings" ? "Your rate from Settings." : estimate.basis === "published" ? (estimate.lines.length ? "Published fees." : "No seller fee.") : "No published fees for this one. Add a rate in Settings."}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="text-xs text-muted-foreground">
        <h2 className="eyebrow mb-2">Where the numbers come from</h2>
        <p className="mb-3">Checked November 2026. Fees change and vary by account, so check before you rely on one. A rate in Settings replaces the published fees for that platform. Shipping you pay through a platform can change what it charges.</p>
        <ul className="flex flex-col gap-1.5">
          {SOURCES.map((source) => (
            <li key={source.label}>
              <a href={source.href} target="_blank" rel="noreferrer" className="inline-block py-1 underline underline-offset-4">{source.label}</a>: {source.note}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
