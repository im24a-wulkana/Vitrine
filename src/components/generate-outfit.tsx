"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import type { OutfitPiece } from "@/components/outfit-builder";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { generateOutfit } from "@/lib/actions/ai";
import { imageFitClass, primaryImage } from "@/lib/format";
import { OCCASIONS } from "@/lib/types";

/** Suggests an outfit. Nothing is saved: "Use this" opens it in the normal editor. */
export function GenerateOutfit({ pieces, aiEnabled, onUse }: { pieces: OutfitPiece[]; aiEnabled: boolean; onUse: (itemIds: string[], occasion: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [occasion, setOccasion] = useState("");
  const [anchor, setAnchor] = useState("");
  const [result, setResult] = useState<{ itemIds: string[]; reasoning: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const personal = pieces.filter((p) => p.status === "personal");
  const byId = new Map(pieces.map((p) => [p.id, p]));

  function generate() {
    setError(null);
    start(async () => {
      const res = await generateOutfit({ occasion: occasion || null, anchorItemId: anchor || null });
      if (!res.ok) {
        setResult(null);
        return setError(res.error);
      }
      setResult(res.data);
    });
  }

  return (
    <>
      <button
        type="button"
        className="fixed right-4 bottom-20 z-20 inline-flex h-14 items-center gap-2 rounded-full bg-foreground pr-5 pl-4 text-sm font-medium text-background shadow-lg md:bottom-8"
        onClick={() => {
          setOpen(true);
          setResult(null);
          setError(null);
        }}
      >
        <Sparkles className="size-5" strokeWidth={1.5} /> Generate
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sheet">
          <DialogHeader className="text-left">
            <DialogTitle>Generate outfit</DialogTitle>
            <DialogDescription>
              {aiEnabled ? "From your personal items, for today's weather." : "AI isn't set up. Add ANTHROPIC_API_KEY to .env.local and restart the app."}
            </DialogDescription>
          </DialogHeader>

          {aiEnabled && (
            <div className="flex max-h-[62dvh] flex-col gap-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-2">
                <select aria-label="Occasion" className="field min-w-0 text-sm" value={occasion} onChange={(e) => setOccasion(e.target.value)}>
                  <option value="">Any occasion</option>
                  {OCCASIONS.map((o) => <option key={o}>{o}</option>)}
                </select>
                <select aria-label="Build around" className="field min-w-0 text-sm" value={anchor} onChange={(e) => setAnchor(e.target.value)}>
                  <option value="">Any piece</option>
                  {personal.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {result && (
                <section aria-label="Suggested outfit" aria-live="polite">
                  <ul className="no-scrollbar flex gap-1 overflow-x-auto">
                    {result.itemIds.map((id) => {
                      const piece = byId.get(id);
                      const image = primaryImage(piece?.item_images);
                      return (
                        <li key={id} className="aspect-[3/4] h-36 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {image && <img src={image} alt={piece?.name ?? ""} className={`size-full ${imageFitClass(piece?.item_images)}`} />}
                        </li>
                      );
                    })}
                  </ul>
                  {result.reasoning && <p className="mt-2 text-sm"><span className="eyebrow mr-1.5">AI</span>{result.reasoning}</p>}
                </section>
              )}
              {error && <p role="alert" className="text-sm font-medium">{error}</p>}
            </div>
          )}

          {aiEnabled ? (
            <div className={result ? "grid grid-cols-2 gap-2" : "grid"}>
              <Button type="button" variant={result ? "outline" : "default"} disabled={pending} onClick={generate}>
                {pending ? "Thinking…" : result ? "Try again" : "Generate"}
              </Button>
              {result && (
                <Button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onUse(result.itemIds, occasion || null);
                  }}
                >
                  Use this
                </Button>
              )}
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
