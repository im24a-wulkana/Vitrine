import { OutfitBuilder, type OutfitPiece, type OutfitRow } from "@/components/outfit-builder";
import { isAiConfigured } from "@/lib/ai/providers";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Outfits" };

export default async function OutfitsPage({ searchParams }: { searchParams: Promise<{ with?: string }> }) {
  const { with: withItem } = await searchParams;
  const { db } = await requireUser();
  const [{ data: pieces }, { data: outfits }] = await Promise.all([
    db.from("items").select("id, brand, name, status, category, item_images(url, is_primary, position, cutout_url)").neq("status", "sold").order("brand"),
    db.from("outfits").select("id, name, mode, occasion, outfit_items(item_id, position, x, y, scale, rotation, z_index)").order("created_at", { ascending: false }),
  ]);
  return <OutfitBuilder pieces={(pieces ?? []) as OutfitPiece[]} outfits={(outfits ?? []) as OutfitRow[]} startWith={withItem} aiEnabled={isAiConfigured()} />;
}
