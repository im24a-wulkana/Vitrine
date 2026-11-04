import { ShippingView, type ShippingSale, type DelistReminder } from "@/components/shipping-view";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Shipping" };

export default async function ShippingPage() {
  const { supabase } = await requireUser();
  const [{ data: sales, error }, { data: reminders }] = await Promise.all([
    supabase
      .from("sales")
      .select("id, item_id, platform, sold_at, tracking_number, shipping_status, items!inner(brand, name, item_images(url, is_primary, position, cutout_url))")
      .order("sold_at", { ascending: false })
      .limit(1000),
    supabase.from("listings").select("id, item_id, platform, items!inner(brand, name)").eq("needs_delisting", true),
  ]);
  if (error) throw new Error(error.message);
  return <ShippingView sales={(sales ?? []) as unknown as ShippingSale[]} reminders={(reminders ?? []) as unknown as DelistReminder[]} />;
}
