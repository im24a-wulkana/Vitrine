"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLot } from "@/lib/actions/business";
import { localDate, money, shortDate, signedMoney } from "@/lib/format";

export interface LotSummary {
  id: string;
  name: string;
  total_cost_chf: number;
  bought_at: string | null;
  source: string | null;
  items: { id: string; status: string; sales: { sale_price: number; net_profit: number } | null }[];
}

export function LotsView({ lots }: { lots: LotSummary[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [date, setDate] = useState(localDate());
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (cost === "" || !(Number(cost) >= 0)) return setError("Enter the total cost");
    setError(null);
    start(async () => {
      const res = await createLot({ name, total_cost_chf: Number(cost), bought_at: date, source });
      if (!res.ok) return setError(res.error);
      router.push(`/lots/${res.data.id}`);
    });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="page-title">Lots</h1>
        <p className="mt-2 text-sm text-muted-foreground">Items bought together. The total cost is split evenly between them.</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3 border-y py-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lot-name">Name</Label>
          <Input id="lot-name" placeholder="Estate sale, 12 pieces" value={name} onChange={(e) => setName(e.target.value)} />
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
        {error && <p role="alert" className="text-sm font-medium">{error}</p>}
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Create lot"}</Button>
      </form>

      {lots.length === 0 ? (
        <p className="text-muted-foreground">No lots yet.</p>
      ) : (
        <ul>
          {lots.map((lot) => {
            const sold = lot.items.filter((i) => i.sales);
            const profit = sold.reduce((sum, i) => sum + Number(i.sales?.net_profit ?? 0), 0);
            return (
              <li key={lot.id} className="border-b">
                <Link href={`/lots/${lot.id}`} className="flex items-center justify-between gap-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{lot.name}</span>
                    <span className="num block text-xs text-muted-foreground">
                      {shortDate(lot.bought_at)} · {money(lot.total_cost_chf)} · {sold.length}/{lot.items.length} sold
                    </span>
                  </span>
                  {sold.length > 0 && <span className="num shrink-0 text-sm">{signedMoney(profit)}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
