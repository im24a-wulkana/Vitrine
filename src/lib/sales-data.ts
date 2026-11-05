import type { DbClient } from "@/lib/db/client";
import type { CompRow, ExpenseRow, SaleRow } from "./metrics";

type SaleQueryRow = Omit<SaleRow, "brand" | "started_at"> & {
  items: { brand: string; size: string | null; buy_date: string | null; listings: { listed_at: string }[] };
};

/** All sales, shaped for the metrics functions. */
export async function getSaleRows(db: DbClient): Promise<SaleRow[]> {
  const { data, error } = await db
    .from("sales")
    .select("sold_at, platform, sale_price, fees, shipping_cost, item_cost_chf, net_profit, items!inner(brand, size, buy_date, listings(listed_at))")
    .limit(20000);
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as SaleQueryRow[]).map(({ items, ...sale }) => {
    const firstListed = items.listings.map((l) => l.listed_at).sort()[0];
    return { ...sale, brand: items.brand, size: items.size, started_at: firstListed ?? items.buy_date };
  });
}

export async function getExpenseRows(db: DbClient): Promise<(ExpenseRow & { category: string; note: string | null })[]> {
  const { data, error } = await db.from("expenses").select("date, amount_chf, category, note").limit(20000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getCompRows(db: DbClient): Promise<CompRow[]> {
  const { data, error } = await db.from("sales").select("sale_price, items!inner(brand, category)").limit(20000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as { sale_price: number; items: { brand: string; category: string | null } }[]).map((row) => ({
    sale_price: row.sale_price,
    brand: row.items.brand,
    category: row.items.category,
  }));
}
