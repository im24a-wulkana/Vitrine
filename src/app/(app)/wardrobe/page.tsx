import { WardrobeView, type WardrobeItem } from "@/components/wardrobe-view";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Wardrobe" };

export default async function WardrobePage() {
  const { db } = await requireUser();
  const { data, error } = await db
    .from("items")
    .select("id, brand, name, buy_price_chf, buy_date, created_at, item_images(url, is_primary, position, cutout_url), wears(worn_on)")
    .eq("status", "personal")
    .limit(5000);
  if (error) throw new Error(error.message);
  return <WardrobeView items={(data ?? []) as WardrobeItem[]} />;
}
