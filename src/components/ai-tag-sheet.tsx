"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ItemTags } from "@/lib/ai/schema";
import { CATEGORIES, OCCASIONS, SEASONS } from "@/lib/types";

export function AiMark() {
  return <span className="eyebrow ml-1.5 font-normal normal-case tracking-normal">AI suggestion</span>;
}

/** Every field is editable, and blank means the AI wasn't sure. Nothing applies until the user confirms. */
export function AiTagSheet({ tags, onApply, onClose }: { tags: ItemTags; onApply: (tags: ItemTags, useLabelAsBrand: boolean) => void; onClose: () => void }) {
  const [category, setCategory] = useState(tags.category ?? "");
  const [subcategory, setSubcategory] = useState(tags.subcategory ?? "");
  const [colors, setColors] = useState((tags.colors ?? []).join(", "));
  const [seasons, setSeasons] = useState<string[]>(tags.seasons ?? []);
  const [occasions, setOccasions] = useState<string[]>(tags.occasions ?? []);
  const [useLabel, setUseLabel] = useState(false);
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sheet">
        <DialogHeader className="text-left">
          <DialogTitle>AI suggestions</DialogTitle>
          <DialogDescription>Check these before applying. Anything blank, the AI wasn&apos;t sure about.</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[62dvh] flex-col gap-4 overflow-y-auto">
          <fieldset>
            <legend className="eyebrow mb-1.5">Category</legend>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button key={c} type="button" className="chip" data-active={category === c} aria-pressed={category === c} onClick={() => setCategory(category === c ? "" : c)}>{c}</button>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="ai-subcategory" className="eyebrow">Subcategory</label>
              <Input id="ai-subcategory" value={subcategory} onChange={(e) => setSubcategory(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="ai-colors" className="eyebrow">Colors</label>
              <Input id="ai-colors" value={colors} onChange={(e) => setColors(e.target.value)} />
            </div>
          </div>
          <fieldset>
            <legend className="eyebrow mb-1.5">Season</legend>
            <div className="flex flex-wrap gap-1.5">
              {SEASONS.map((s) => (
                <button key={s} type="button" className="chip" data-active={seasons.includes(s)} aria-pressed={seasons.includes(s)} onClick={() => setSeasons(toggle(seasons, s))}>{s}</button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="eyebrow mb-1.5">Occasion</legend>
            <div className="flex flex-wrap gap-1.5">
              {OCCASIONS.map((o) => (
                <button key={o} type="button" className="chip" data-active={occasions.includes(o)} aria-pressed={occasions.includes(o)} onClick={() => setOccasions(toggle(occasions, o))}>{o}</button>
              ))}
            </div>
          </fieldset>
          {tags.label_text && (
            <div className="rounded-lg border p-3 text-sm">
              <p className="eyebrow mb-1">Text read from a label</p>
              <p className="break-words">{tags.label_text}</p>
              <label className="mt-2 flex min-h-9 items-center gap-2">
                <input type="checkbox" className="size-5 accent-foreground" checked={useLabel} onChange={(e) => setUseLabel(e.target.checked)} />
                Use this as the brand
              </label>
            </div>
          )}
        </div>

        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Dismiss</Button>
          <Button
            type="button"
            onClick={() =>
              onApply(
                {
                  category: (category || null) as ItemTags["category"],
                  subcategory: subcategory.trim() || null,
                  colors: colors.split(",").map((c) => c.trim()).filter(Boolean),
                  seasons: seasons as ItemTags["seasons"],
                  occasions: occasions as ItemTags["occasions"],
                  label_text: tags.label_text,
                },
                useLabel,
              )
            }
          >
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
