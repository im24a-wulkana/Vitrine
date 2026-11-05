import { WishlistView } from "@/components/wishlist-view";
import { requireUser } from "@/lib/session";
import type { WishlistEntry } from "@/lib/types";

export const metadata = { title: "Wishlist" };

export default async function WishlistPage() {
  const { db } = await requireUser();
  const { data, error } = await db.from("wishlist").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return <WishlistView entries={(data ?? []) as WishlistEntry[]} />;
}
