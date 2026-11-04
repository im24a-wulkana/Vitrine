"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addWish, deleteWish } from "@/lib/actions/records";
import { money } from "@/lib/format";
import type { WishlistEntry } from "@/lib/types";

const EMPTY = { brand: "", name: "", target: "", link: "", notes: "" };

export function WishlistView({ entries }: { entries: WishlistEntry[] }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (key: keyof typeof EMPTY, value: string) => setForm((f) => ({ ...f, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.target !== "" && !(Number(form.target) >= 0)) return setError("Enter a valid target price");
    setError(null);
    start(async () => {
      const res = await addWish({
        brand: form.brand,
        name: form.name,
        target_price: form.target === "" ? null : Number(form.target),
        link: form.link,
        notes: form.notes,
      });
      if (!res.ok) return setError(res.error);
      setForm(EMPTY);
    });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <h1 className="page-title">Wishlist</h1>

      <form onSubmit={submit} className="flex flex-col gap-3 border-y py-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="wish-brand">Brand</Label>
            <Input id="wish-brand" value={form.brand} onChange={(e) => set("brand", e.target.value)} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="wish-target">Target price, CHF</Label>
            <Input id="wish-target" inputMode="decimal" className="num" value={form.target} onChange={(e) => set("target", e.target.value.replace(",", "."))} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wish-name">Name</Label>
          <Input id="wish-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wish-link">Link</Label>
          <Input id="wish-link" type="url" inputMode="url" placeholder="https://" value={form.link} onChange={(e) => set("link", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wish-notes">Notes</Label>
          <Textarea id="wish-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm font-medium">{error}</p>}
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add to wishlist"}</Button>
      </form>

      {entries.length === 0 ? (
        <p className="text-muted-foreground">Nothing on your wishlist yet.</p>
      ) : (
        <ul>
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 border-b py-3">
              <div className="min-w-0 flex-1">
                {entry.brand && <p className="eyebrow">{entry.brand}</p>}
                <p className="text-sm">
                  {entry.link ? <a href={entry.link} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{entry.name}</a> : entry.name}
                </p>
                {entry.notes && <p className="mt-1 text-xs text-muted-foreground">{entry.notes}</p>}
              </div>
              {entry.target_price !== null && <span className="num text-sm">{money(entry.target_price)}</span>}
              <button type="button" aria-label={`Remove ${entry.name}`} disabled={pending} className="grid size-10 place-items-center text-muted-foreground" onClick={() => start(async () => { await deleteWish(entry.id); })}>
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
