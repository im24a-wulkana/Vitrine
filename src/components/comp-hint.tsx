"use client";

import { money } from "@/lib/format";
import { priceComps, type CompRow } from "@/lib/metrics";

/** Suggests a price from the user's own past sales. Shows nothing when there are none. */
export function CompHint({ rows, brand, category, onUse }: { rows: CompRow[]; brand: string; category: string | null; onUse: (price: number) => void }) {
  const comps = priceComps(rows, brand, category);
  if (!comps) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span>
        Your past sales, {comps.scope}: {comps.count === 1 ? (
          <>sold once at <span className="num">{money(comps.low)}</span>.</>
        ) : (
          <><span className="num">{comps.count}</span> sold, <span className="num">{money(comps.low)}–{money(comps.high)}</span>.</>
        )}
      </span>
      <button type="button" className="num font-medium text-foreground underline underline-offset-4" onClick={() => onUse(comps.median)}>
        Use {money(comps.median)}
      </button>
    </p>
  );
}
