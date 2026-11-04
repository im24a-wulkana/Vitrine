"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { updateListingPrice } from "@/lib/actions/sales";
import { money } from "@/lib/format";
import type { AgingAlert } from "@/lib/queries";

export function AlertRow({ alert }: { alert: AgingAlert }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const suggested = alert.suggested_price;

  return (
    <li className="flex gap-3 border-b py-3">
      <Link href={`/items/${alert.item_id}`} aria-label={alert.name} className="block h-24 w-20 shrink-0 bg-muted">
        {alert.image && <img src={alert.image} alt="" loading="lazy" className="size-full object-cover" />}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="eyebrow truncate">{alert.brand} · {alert.platform}</p>
        <Link href={`/items/${alert.item_id}`} className="truncate py-1 text-sm">{alert.name}</Link>
        <p className="num text-sm">
          <span className="text-muted-foreground">{alert.age_days}d</span>
          {alert.list_price !== null && <> · {money(alert.list_price)}</>}
        </p>
        <div className="mt-auto">
          {suggested !== null ? (
            <Button
              size="sm"
              disabled={pending}
              className="num"
              onClick={() =>
                start(async () => {
                  setError(null);
                  const res = await updateListingPrice(alert.listing_id, suggested);
                  if (!res.ok) setError(res.error);
                })
              }
            >
              {pending ? "Saving…" : `Mark down to ${money(suggested)}`}
            </Button>
          ) : (
            <Link href={`/items/${alert.item_id}`} className="text-sm underline underline-offset-4">Add a list price</Link>
          )}
          {error && <p role="alert" className="mt-1 text-sm font-medium">{error}</p>}
        </div>
      </div>
    </li>
  );
}
