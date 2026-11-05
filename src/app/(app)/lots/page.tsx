import { LotsView, type LotSummary } from "@/components/lots-view";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Lots" };

export default async function LotsPage() {
  const { db } = await requireUser();
  const { data, error } = await db
    .from("lots")
    .select("id, name, total_cost_chf, bought_at, source, items(id, status, sales(sale_price, net_profit))")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return <LotsView lots={(data ?? []) as unknown as LotSummary[]} />;
}
