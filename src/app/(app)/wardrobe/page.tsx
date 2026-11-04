import { WardrobeView, type WardrobeItem } from "@/components/wardrobe-view";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Wardrobe" };

export default async function WardrobePage() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("items")
    .select("id, brand, name, buy_price_chf, buy_date, created_at, item_images(url, is_primary, position), wears(worn_on)")
    .eq("status", "personal")
    .limit(5000);
  if (error) throw new Error(error.message);
  return <WardrobeView items={(data ?? []) as WardrobeItem[]} />;
}
