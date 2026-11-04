import { costPerWear, isUnworn } from "./metrics";
import { closetTab } from "./types";

export interface InsightItem {
  id: string;
  brand: string;
  name: string;
  category: string | null;
  color: string | null;
  colors: string[];
  buy_price_chf: number;
  buy_date: string | null;
  created_at: string;
  wears: { worn_on: string }[];
}

export interface RankedItem {
  item: InsightItem;
  wears: number;
  costPerWear: number | null;
  lastWorn: string | null;
}

export interface Share {
  name: string;
  count: number;
  share: number;
}

function rank(item: InsightItem): RankedItem {
  return {
    item,
    wears: item.wears.length,
    costPerWear: costPerWear(Number(item.buy_price_chf), item.wears.length),
    lastWorn: item.wears.map((w) => w.worn_on).sort().at(-1) ?? null,
  };
}

/** Ties break on name, so the order doesn't shuffle between visits. */
export function mostWorn(items: InsightItem[], limit = 5): RankedItem[] {
  return items
    .map(rank)
    .filter((r) => r.wears > 0)
    .sort((a, b) => b.wears - a.wears || a.item.name.localeCompare(b.item.name))
    .slice(0, limit);
}

export function leastWorn(items: InsightItem[], limit = 5): RankedItem[] {
  return items
    .map(rank)
    .sort((a, b) => a.wears - b.wears || a.item.name.localeCompare(b.item.name))
    .slice(0, limit);
}

export function notWornIn6Months(items: InsightItem[], today: string): RankedItem[] {
  return items
    .map(rank)
    .filter((r) => isUnworn(r.lastWorn, r.item.buy_date ?? r.item.created_at, today))
    .sort((a, b) => (a.lastWorn ?? "").localeCompare(b.lastWorn ?? "") || a.item.name.localeCompare(b.item.name));
}

function shares(names: string[]): Share[] {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, share: count / names.length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function categoryBreakdown(items: InsightItem[]): Share[] {
  return shares(items.map((i) => closetTab(i.category) ?? "Other"));
}

/** Each piece counts once, under its main colour, so the shares add up to 100%. */
export function colorBreakdown(items: InsightItem[]): Share[] {
  return shares(items.map((i) => i.colors[0] ?? i.color ?? "Unknown"));
}
