import { notFound } from "next/navigation";
import { LotDetail, type LotDetailData, type LotCandidate } from "@/components/lot-detail";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Lot" };

export default async function LotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [{ data: lot }, { data: candidates }] = await Promise.all([
    supabase
      .from("lots")
      .select("id, name, total_cost_chf, bought_at, source, items(id, brand, name, status, buy_price_chf, item_images(url, is_primary, position, cutout_url), sales(sale_price, net_profit))")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("items").select("id, brand, name, status, lot_id").neq("status", "sold").order("brand").limit(5000),
  ]);
  if (!lot) notFound();

  const free = ((candidates ?? []) as (LotCandidate & { lot_id: string | null })[]).filter((c) => !c.lot_id);
  return <LotDetail lot={lot as unknown as LotDetailData} candidates={free} />;
}
