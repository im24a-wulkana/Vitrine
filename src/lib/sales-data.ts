import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExpenseRow, SaleRow } from "./metrics";

type SaleQueryRow = Omit<SaleRow, "brand" | "started_at"> & {
  items: { brand: string; buy_date: string | null; listings: { listed_at: string }[] };
};

/** All sales, shaped for the metrics functions. */
export async function getSaleRows(supabase: SupabaseClient): Promise<SaleRow[]> {
  const { data, error } = await supabase
    .from("sales")
    .select("sold_at, platform, sale_price, fees, shipping_cost, item_cost_chf, net_profit, items!inner(brand, buy_date, listings(listed_at))")
    .limit(20000);
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as SaleQueryRow[]).map(({ items, ...sale }) => {
    const firstListed = items.listings.map((l) => l.listed_at).sort()[0];
    return { ...sale, brand: items.brand, started_at: firstListed ?? items.buy_date };
  });
}

export async function getExpenseRows(supabase: SupabaseClient): Promise<(ExpenseRow & { category: string; note: string | null })[]> {
  const { data, error } = await supabase.from("expenses").select("date, amount_chf, category, note").limit(20000);
  if (error) throw new Error(error.message);
  return data ?? [];
}
