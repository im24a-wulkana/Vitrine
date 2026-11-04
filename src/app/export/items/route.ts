import { csvResponse, unauthorized } from "@/lib/csv-response";
import { getUser } from "@/lib/supabase/server";
import type { InventoryItem } from "@/lib/types";

// Column names match the import fields, so this file can be imported back in.
const HEADER = [
  "brand", "name", "category", "size", "color", "condition", "status",
  "buy_price", "buy_currency", "buy_price_chf", "buy_date", "buy_source", "notes", "tags",
  "platform", "list_price", "sale_price", "fees", "shipping_cost", "sold_at", "net_profit",
];

export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return unauthorized();

  const { data, error } = await supabase
    .from("items")
    .select("*, listings(*), sales(*)")
    .order("created_at", { ascending: true })
    .limit(50000);
  if (error) return new Response(error.message, { status: 500 });

  const rows = ((data ?? []) as InventoryItem[]).map((item) => {
    const listing = item.listings.find((l) => !l.delisted_at);
    const sale = item.sales;
    return [
      item.brand, item.name, item.category, item.size, item.color, item.condition, item.status,
      Number(item.buy_price), item.buy_currency, Number(item.buy_price_chf), item.buy_date, item.buy_source, item.notes, item.tags.join("; "),
      sale?.platform ?? listing?.platform ?? null,
      listing?.list_price == null ? null : Number(listing.list_price),
      sale ? Number(sale.sale_price) : null,
      sale ? Number(sale.fees) : null,
      sale ? Number(sale.shipping_cost) : null,
      sale?.sold_at ?? null,
      sale ? Number(sale.net_profit) : null,
    ];
  });

  return csvResponse("vitrine-items.csv", [HEADER, ...rows]);
}
