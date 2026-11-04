"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addOffer, deleteOffer, setOfferStatus } from "@/lib/actions/business";
import { money, shortDate } from "@/lib/format";
import type { Offer, Platform } from "@/lib/types";

const STATUSES: [Offer["status"], string][] = [
  ["pending", "Pending"],
  ["accepted", "Accepted"],
  ["declined", "Declined"],
  ["countered", "Countered"],
];

export function OfferLog({ itemId, offers, platforms, canAdd }: { itemId: string; offers: Offer[]; platforms: Platform[]; canAdd: boolean }) {
  const [amount, setAmount] = useState("");
  const [platformId, setPlatformId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sorted = [...offers].sort((a, b) => b.created_at.localeCompare(a.created_at));

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, then?: () => void) {
    setError(null);
    start(async () => {
      const res = await action();
      if (!res.ok) return setError(res.error);
      then?.();
    });
  }

  if (!canAdd && sorted.length === 0) return null;

  return (
    <section>
      <h2 className="eyebrow border-b pb-2">Offers</h2>
      {sorted.length > 0 && (
        <ul className="text-sm">
          {sorted.map((offer) => (
            <li key={offer.id} className="flex items-center gap-2 border-b py-2">
              <div className="min-w-0 flex-1">
                <p className="num">{money(offer.amount_chf)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="num">{shortDate(offer.created_at)}</span>{offer.platforms ? ` · ${offer.platforms.name}` : ""}
                </p>
              </div>
              <select aria-label={`Status of offer of ${money(offer.amount_chf)}`} disabled={pending} className="field h-9 w-auto text-sm" value={offer.status} onChange={(e) => run(() => setOfferStatus(offer.id, e.target.value))}>
                {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button type="button" aria-label={`Delete offer of ${money(offer.amount_chf)}`} disabled={pending} className="grid size-9 place-items-center text-muted-foreground" onClick={() => run(() => deleteOffer(offer.id))}>
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <form
          className="mt-3 grid grid-cols-[6rem_minmax(0,1fr)_auto] gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (amount === "" || !(Number(amount) >= 0)) return setError("Enter an amount");
            run(
              () => addOffer({ item_id: itemId, platform_id: platformId || null, amount_chf: Number(amount), status: "pending" }),
              () => setAmount(""),
            );
          }}
        >
          <Input aria-label="Offer amount in CHF" inputMode="decimal" placeholder="CHF" className="num" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} />
          <select aria-label="Offer platform" className="field min-w-0 text-sm" value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
            <option value="">Platform</option>
            {platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Button type="submit" variant="outline" disabled={pending}>Log</Button>
        </form>
      )}
      {error && <p role="alert" className="mt-1 text-sm font-medium">{error}</p>}
    </section>
  );
}
