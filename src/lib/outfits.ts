import { closetTab } from "./types";

// Slot mode's rows, top to bottom. Each holds one piece at a time.
export const SLOTS = ["Outerwear", "Tops", "Bottoms", "Shoes", "Accessories"] as const;
export type Slot = (typeof SLOTS)[number];

/** Activewear sits with tops. Anything uncategorised goes with accessories, so no piece is unreachable. */
export function slotFor(category: string | null): Slot {
  const tab = closetTab(category);
  if (tab === "Outerwear" || tab === "Bottoms" || tab === "Shoes" || tab === "Tops") return tab;
  if (tab === "Activewear") return "Tops";
  return "Accessories";
}

export interface Placement {
  item_id: string;
  /** Centre of the piece, as a fraction of canvas width and height. */
  x: number;
  y: number;
  /** Width of the piece, as a fraction of canvas width. */
  scale: number;
  rotation: number;
  z_index: number;
}

const DEFAULTS: Record<Slot, Pick<Placement, "x" | "y" | "scale">> = {
  Outerwear: { x: 0.3, y: 0.32, scale: 0.55 },
  Tops: { x: 0.62, y: 0.27, scale: 0.5 },
  Bottoms: { x: 0.5, y: 0.62, scale: 0.42 },
  Shoes: { x: 0.5, y: 0.89, scale: 0.34 },
  Accessories: { x: 0.82, y: 0.7, scale: 0.3 },
};

/** Where a new piece lands: roughly where it would sit on a body, on top of everything else. */
export function defaultPlacement(itemId: string, category: string | null, existing: Pick<Placement, "z_index">[] = []): Placement {
  return {
    item_id: itemId,
    ...DEFAULTS[slotFor(category)],
    rotation: 0,
    z_index: existing.length ? Math.max(...existing.map((p) => p.z_index)) + 1 : 0,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Keeps a piece's centre on the canvas, so it can never be dragged out of reach. */
export function clampPosition<T extends Pick<Placement, "x" | "y">>(placement: T): T {
  return { ...placement, x: clamp(placement.x, 0, 1), y: clamp(placement.y, 0, 1) };
}

export const MIN_SCALE = 0.08;
export const MAX_SCALE = 1.5;

/** Moves one piece a layer up or down, and renumbers so layers stay 0, 1, 2… */
export function moveLayer(placements: Placement[], itemId: string, direction: 1 | -1): Placement[] {
  const ordered = [...placements].sort((a, b) => a.z_index - b.z_index);
  const from = ordered.findIndex((p) => p.item_id === itemId);
  const to = from + direction;
  if (from !== -1 && to >= 0 && to < ordered.length) {
    [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  }
  return ordered.map((p, z_index) => ({ ...p, z_index }));
}

/** The piece a slot row shows. */
export function pieceInSlot<T extends { item_id: string }>(placements: T[], slot: Slot, categoryOf: (itemId: string) => string | null): T | null {
  return placements.find((p) => slotFor(categoryOf(p.item_id)) === slot) ?? null;
}

/** Picking a piece in a row replaces whatever that row held. Null empties the row. */
export function replaceSlot(
  placements: Placement[],
  slot: Slot,
  itemId: string | null,
  categoryOf: (itemId: string) => string | null,
): Placement[] {
  const kept = placements.filter((p) => slotFor(categoryOf(p.item_id)) !== slot);
  return itemId ? [...kept, defaultPlacement(itemId, categoryOf(itemId), kept)] : kept;
}
