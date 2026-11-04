"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { bulkSetStatus } from "@/lib/actions/items";
import { money, percent, shortDate } from "@/lib/format";
import { categoryBreakdown, colorBreakdown, leastWorn, mostWorn, notWornIn6Months, type InsightItem, type RankedItem, type Share } from "@/lib/insights";

function WearList({ title, rows }: { title: string; rows: RankedItem[] }) {
  return (
    <section>
      <h2 className="eyebrow border-b pb-2">{title}</h2>
      {rows.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">Nothing logged yet.</p>
      ) : (
        <ol>
          {rows.map(({ item, wears, costPerWear }) => (
            <li key={item.id} className="border-b">
              <Link href={`/items/${item.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{item.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.brand}</span>
                </span>
                <span className="num shrink-0 text-right text-sm">
                  {wears}×
                  <span className="block text-xs text-muted-foreground">{costPerWear === null ? "No wears" : `${money(costPerWear)}/wear`}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Horizontal bars with every value labelled, so nothing depends on colour or hovering. */
function Breakdown({ title, rows }: { title: string; rows: Share[] }) {
  const largest = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section>
      <h2 className="eyebrow border-b pb-2">{title}</h2>
      <ul className="mt-3 flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.name} className="grid grid-cols-[6rem_minmax(0,1fr)_5rem] items-center gap-2 text-sm">
            <span className="truncate">{row.name}</span>
            <span aria-hidden className="block h-2 rounded-full bg-muted">
              <span className="block h-full rounded-full bg-foreground" style={{ width: `${(row.count / largest) * 100}%` }} />
            </span>
            <span className="num text-right text-xs text-muted-foreground">{row.count} · {percent(row.share)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function InsightsView({ items, today }: { items: InsightItem[]; today: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const unworn = notWornIn6Months(items, today);
  const totalWears = items.reduce((sum, i) => sum + i.wears.length, 0);
  const totalCost = items.reduce((sum, i) => sum + Number(i.buy_price_chf), 0);

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="page-title">Insights</h1>
        <p className="text-muted-foreground">Insights cover your personal items. Mark some items as Personal to see them here.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <h1 className="page-title">Insights</h1>

      <dl className="grid grid-cols-3 gap-4">
        {([
          ["Pieces", String(items.length)],
          ["Wears", String(totalWears)],
          ["Cost per wear", totalWears ? money(totalCost / totalWears) : "—"],
        ] as const).map(([label, value]) => (
          <div key={label} className="border-t pt-2">
            <dt className="eyebrow">{label}</dt>
            <dd className="num mt-1 text-2xl">{value}</dd>
          </div>
        ))}
      </dl>

      {error && <p role="alert" className="text-sm font-medium">{error}</p>}

      {unworn.length > 0 && (
        <section>
          <h2 className="eyebrow border-b pb-2">Not worn in 6+ months. Sell?</h2>
          <ul>
            {unworn.map(({ item, lastWorn }) => (
              <li key={item.id} className="flex items-center gap-3 border-b py-2">
                <Link href={`/items/${item.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{item.brand} · {item.name}</span>
                  <span className="num block text-xs text-muted-foreground">{lastWorn ? `Last worn ${shortDate(lastWorn)}` : "Never worn"}</span>
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  aria-label={`Move ${item.name} to stock`}
                  onClick={() =>
                    start(async () => {
                      setError(null);
                      const res = await bulkSetStatus([item.id], "in_stock");
                      if (!res.ok) setError(res.error);
                    })
                  }
                >
                  Move to stock
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-10 md:grid-cols-2">
        <WearList title="Most worn" rows={mostWorn(items)} />
        <WearList title="Least worn" rows={leastWorn(items)} />
        <Breakdown title="By category" rows={categoryBreakdown(items)} />
        <Breakdown title="By color" rows={colorBreakdown(items)} />
      </div>
    </div>
  );
}
