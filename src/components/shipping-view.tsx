"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmDelisted, updateShipping } from "@/lib/actions/business";
import { imageFitClass, primaryImage, shortDate } from "@/lib/format";
import type { ShippingStatus } from "@/lib/types";

export interface ShippingSale {
  id: string;
  item_id: string;
  platform: string;
  sold_at: string;
  tracking_number: string | null;
  shipping_status: ShippingStatus;
  items: { brand: string; name: string; item_images: { url: string; is_primary: boolean; position: number; cutout_url: string | null }[] };
}

export interface DelistReminder {
  id: string;
  item_id: string;
  platform: string;
  items: { brand: string; name: string };
}

const TABS: [ShippingStatus, string][] = [
  ["to_ship", "To ship"],
  ["shipped", "Shipped"],
  ["delivered", "Delivered"],
  ["returned", "Returned"],
];

const NEXT: Partial<Record<ShippingStatus, [ShippingStatus, string]>> = {
  to_ship: ["shipped", "Mark shipped"],
  shipped: ["delivered", "Mark delivered"],
};

function SaleRow({ sale }: { sale: ShippingSale }) {
  const [tracking, setTracking] = useState(sale.tracking_number ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const image = primaryImage(sale.items.item_images);
  const next = NEXT[sale.shipping_status];

  function save(status: ShippingStatus) {
    setError(null);
    start(async () => {
      const res = await updateShipping(sale.id, { status, tracking });
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <li className="flex gap-3 border-b py-3">
      <Link href={`/items/${sale.item_id}`} aria-label={sale.items.name} className="block h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-md bg-muted">
        {image && <img src={image} alt="" loading="lazy" className={`size-full ${imageFitClass(sale.items.item_images)}`} />}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <p className="eyebrow truncate">{sale.items.brand} · {sale.platform}</p>
          <Link href={`/items/${sale.item_id}`} className="block truncate py-1 text-sm">{sale.items.name}</Link>
          <p className="num text-xs text-muted-foreground">Sold {shortDate(sale.sold_at)}</p>
        </div>
        <form
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save(sale.shipping_status);
          }}
        >
          <Input aria-label={`Tracking number for ${sale.items.name}`} placeholder="Tracking number" className="num h-11" value={tracking} onChange={(e) => setTracking(e.target.value)} onBlur={() => { if (tracking !== (sale.tracking_number ?? "")) save(sale.shipping_status); }} />
          {next ? (
            <Button type="button" size="sm" disabled={pending} onClick={() => save(next[0])}>{next[1]}</Button>
          ) : sale.shipping_status === "delivered" ? (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => save("returned")}>Returned</Button>
          ) : (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => save("to_ship")}>Resend</Button>
          )}
        </form>
        {error && <p role="alert" className="text-sm font-medium">{error}</p>}
      </div>
    </li>
  );
}

export function ShippingView({ sales, reminders }: { sales: ShippingSale[]; reminders: DelistReminder[] }) {
  const [tab, setTab] = useState<ShippingStatus>("to_ship");
  const [pending, start] = useTransition();
  const visible = sales.filter((s) => s.shipping_status === tab);
  const count = (status: ShippingStatus) => sales.filter((s) => s.shipping_status === status).length;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title">Shipping</h1>

      {reminders.length > 0 && (
        <section className="rounded-lg border border-foreground p-3">
          <h2 className="text-sm font-medium">Sold, but still live elsewhere</h2>
          <ul className="mt-1">
            {reminders.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 border-t py-2 text-sm first:border-t-0">
                <span className="min-w-0 truncate">{r.items.brand} · {r.items.name} <span className="text-muted-foreground">on {r.platform}</span></span>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { await confirmDelisted([r.id]); })}>Delisted</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div>
        <nav aria-label="Shipping status" className="no-scrollbar -mx-4 flex gap-5 overflow-x-auto border-b px-4 md:mx-0 md:px-0">
          {TABS.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)} className={`eyebrow -mb-px border-b-2 py-2.5 whitespace-nowrap ${tab === value ? "border-foreground text-foreground" : "border-transparent"}`}>
              {label} <span className="num">{count(value)}</span>
            </button>
          ))}
        </nav>
        {visible.length === 0 ? (
          <p className="py-10 text-muted-foreground">{tab === "to_ship" ? "Nothing to ship." : "Nothing here."}</p>
        ) : (
          <ul>{visible.map((sale) => <SaleRow key={sale.id} sale={sale} />)}</ul>
        )}
      </div>
    </div>
  );
}
