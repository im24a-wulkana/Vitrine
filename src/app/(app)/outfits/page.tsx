import { OutfitBuilder, type OutfitPiece, type OutfitRow } from "@/components/outfit-builder";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Outfits" };

export default async function OutfitsPage({ searchParams }: { searchParams: Promise<{ with?: string }> }) {
  const { with: withItem } = await searchParams;
  const { supabase } = await requireUser();
  const [{ data: pieces }, { data: outfits }] = await Promise.all([
    supabase.from("items").select("id, brand, name, status, item_images(url, is_primary, position, cutout_url)").neq("status", "sold").order("brand"),
    supabase.from("outfits").select("id, name, outfit_items(item_id, position)").order("created_at", { ascending: false }),
  ]);
  return <OutfitBuilder pieces={(pieces ?? []) as OutfitPiece[]} outfits={(outfits ?? []) as OutfitRow[]} startWith={withItem} />;
}
