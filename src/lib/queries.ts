import type { DbClient } from "@/lib/db/client";
import { listingAgeDays, suggestedMarkdown } from "./metrics";
import type { UserSettings } from "./types";

const DEFAULT_SETTINGS = { default_currency: "CHF", aging_threshold_days: 30, markdown_percent: 10, monthly_profit_goal_chf: null, city: null, lat: null, lon: null, theme: null };

export async function getSettings(db: DbClient, userId: string): Promise<UserSettings> {
  const { data } = await db.from("user_settings").select("*").eq("user_id", userId).maybeSingle();
  return data ?? { user_id: userId, ...DEFAULT_SETTINGS };
}

export interface AgingAlert {
  listing_id: string;
  item_id: string;
  platform: string;
  list_price: number | null;
  suggested_price: number | null;
  age_days: number;
  brand: string;
  name: string;
  image: string | null;
}

type AgingQueryRow = {
  id: string;
  item_id: string;
  platform: string;
  list_price: number | null;
  listed_at: string;
  price_changes: { changed_at: string }[];
  items: {
    brand: string;
    name: string;
    item_images: { url: string; is_primary: boolean; position: number }[];
  };
};

export async function getAgingAlerts(db: DbClient, settings: UserSettings, today: string): Promise<AgingAlert[]> {
  const { data } = await db
    .from("listings")
    .select("id, item_id, platform, list_price, listed_at, price_changes(changed_at), items!inner(brand, name, item_images(url, is_primary, position))")
    .is("delisted_at", null);

  const rows = (data ?? []) as unknown as AgingQueryRow[];
  return rows
    .map((l) => ({
      listing_id: l.id,
      item_id: l.item_id,
      platform: l.platform,
      list_price: l.list_price,
      suggested_price: l.list_price === null ? null : suggestedMarkdown(Number(l.list_price), Number(settings.markdown_percent)),
      age_days: listingAgeDays(l, today),
      brand: l.items.brand,
      name: l.items.name,
      image: l.items.item_images.find((i) => i.is_primary)?.url ?? l.items.item_images[0]?.url ?? null,
    }))
    .filter((a) => a.age_days >= settings.aging_threshold_days)
    .sort((a, b) => b.age_days - a.age_days);
}
