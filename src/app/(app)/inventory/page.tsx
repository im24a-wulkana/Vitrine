import { InventoryView } from "@/components/inventory-view";
import { requireUser } from "@/lib/supabase/server";
import type { InventoryItem, Platform } from "@/lib/types";

export const metadata = { title: "Stock" };

export default async function InventoryPage() {
  const { supabase } = await requireUser();
  const [{ data: items, error }, { data: platforms }] = await Promise.all([
    supabase
      .from("items")
      .select("*, item_images(*), listings(*), sales(*)")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase.from("platforms").select("*").order("name"),
  ]);
  if (error) throw new Error(error.message);

  return <InventoryView items={(items ?? []) as InventoryItem[]} platforms={(platforms ?? []) as Platform[]} />;
}
