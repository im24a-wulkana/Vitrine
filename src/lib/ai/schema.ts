import { z } from "zod";

// The shapes the AI must return. Every tag can be null, which is how it says
// "I can't tell" rather than guessing. There is deliberately no brand field:
// brand only comes from the user, or from label text they choose to accept.

export const ItemTagsSchema = z.object({
  category: z.enum(["Tops", "Bottoms", "Outerwear", "Shoes", "Accessories", "Activewear"]).nullable(),
  subcategory: z.string().nullable(),
  colors: z.array(z.string()).nullable(),
  seasons: z.array(z.enum(["Spring", "Summer", "Autumn", "Winter"])).nullable(),
  occasions: z.array(z.enum(["Everyday", "Work", "Evening", "Formal", "Sport", "Travel"])).nullable(),
  label_text: z.string().nullable(),
});
export type ItemTags = z.infer<typeof ItemTagsSchema>;

export const OutfitSuggestionSchema = z.object({
  item_ids: z.array(z.string()),
  reasoning: z.string().nullable(),
});
export type OutfitSuggestion = z.infer<typeof OutfitSuggestionSchema>;

export interface OutfitRequestItem {
  id: string;
  brand: string;
  name: string;
  slot: string;
  subcategory: string | null;
  colors: string[];
  seasons: string[];
  occasions: string[];
}

export interface OutfitRequest {
  items: OutfitRequestItem[];
  occasion: string | null;
  anchorItemId: string | null;
  weather: { temp: number; high: number; low: number; label: string } | null;
}

/**
 * Never trust model output as ids. Keeps only pieces the user owns, at most one
 * per slot, and always includes the anchor. Returns [] if nothing usable is left.
 */
export function sanitizeOutfit(suggested: string[], request: Pick<OutfitRequest, "items" | "anchorItemId">): string[] {
  const byId = new Map(request.items.map((item) => [item.id, item]));
  const ordered = request.anchorItemId ? [request.anchorItemId, ...suggested] : suggested;
  const usedSlots = new Set<string>();
  const result: string[] = [];
  for (const id of ordered) {
    const item = byId.get(id);
    if (!item || usedSlots.has(item.slot)) continue;
    usedSlots.add(item.slot);
    result.push(id);
  }
  return result;
}
