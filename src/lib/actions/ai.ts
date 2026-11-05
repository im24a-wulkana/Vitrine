"use server";

import { AiError, getLLMProvider } from "@/lib/ai/providers";
import { sanitizeOutfit, type OutfitRequestItem } from "@/lib/ai/schema";
import { slotFor } from "@/lib/outfits";
import { getSettings } from "@/lib/queries";
import { getUser } from "@/lib/session";
import type { ActionResult } from "@/lib/types";
import { getWeather } from "@/lib/weather";

type PersonalItem = {
  id: string;
  brand: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  color: string | null;
  colors: string[];
  seasons: string[];
  occasions: string[];
};

/** Suggests an outfit from the user's personal items. Saves nothing until they choose to. */
export async function generateOutfit(input: { occasion: string | null; anchorItemId: string | null }): Promise<ActionResult<{ itemIds: string[]; reasoning: string | null }>> {
  const { db, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const provider = getLLMProvider();
  if (!provider) return { ok: false, error: "AI isn't set up. Add ANTHROPIC_API_KEY to .env.local and restart the app." };

  const { data, error } = await db
    .from("items")
    .select("id, brand, name, category, subcategory, color, colors, seasons, occasions")
    .eq("status", "personal")
    .limit(1000);
  if (error) return { ok: false, error: error.message };

  const items: OutfitRequestItem[] = ((data ?? []) as PersonalItem[]).map((item) => ({
    id: item.id,
    brand: item.brand,
    name: item.name,
    slot: slotFor(item.category),
    subcategory: item.subcategory,
    colors: item.colors.length ? item.colors : item.color ? [item.color] : [],
    seasons: item.seasons,
    occasions: item.occasions,
  }));
  if (items.length < 2) return { ok: false, error: "Add at least two personal items first." };

  const anchorItemId = input.anchorItemId && items.some((i) => i.id === input.anchorItemId) ? input.anchorItemId : null;
  const settings = await getSettings(db, user.id);
  const weather = settings.lat !== null && settings.lon !== null ? await getWeather(settings.lat, settings.lon) : null;

  try {
    const suggestion = await provider.suggestOutfit({
      items,
      occasion: input.occasion,
      anchorItemId,
      weather: weather && { temp: weather.temp, high: weather.high, low: weather.low, label: weather.label },
    });
    const itemIds = sanitizeOutfit(suggestion.item_ids, { items, anchorItemId });
    if (itemIds.length === 0) return { ok: false, error: "The AI couldn't find a sensible outfit. Try another occasion." };
    return { ok: true, data: { itemIds, reasoning: suggestion.reasoning } };
  } catch (e) {
    return { ok: false, error: e instanceof AiError ? e.message : "The AI request failed." };
  }
}
