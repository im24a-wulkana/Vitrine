import { WishlistView } from "@/components/wishlist-view";
import { requireUser } from "@/lib/supabase/server";
import type { WishlistEntry } from "@/lib/types";

export const metadata = { title: "Wishlist" };

export default async function WishlistPage() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("wishlist").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return <WishlistView entries={(data ?? []) as WishlistEntry[]} />;
}
