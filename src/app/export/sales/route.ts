import { csvResponse, unauthorized } from "@/lib/csv-response";
import { getUser } from "@/lib/session";

type Row = {
  sold_at: string;
  platform: string;
  sale_price: number;
  fees: number;
  shipping_cost: number;
  item_cost_chf: number;
  net_profit: number;
  shipping_status: string;
  tracking_number: string | null;
  items: { brand: string; name: string };
};

export async function GET() {
  const { db, user } = await getUser();
  if (!user) return unauthorized();

  const { data, error } = await db
    .from("sales")
    .select("sold_at, platform, sale_price, fees, shipping_cost, item_cost_chf, net_profit, shipping_status, tracking_number, items!inner(brand, name)")
    .order("sold_at")
    .limit(50000);
  if (error) return new Response(error.message, { status: 500 });

  const rows = ((data ?? []) as unknown as Row[]).map((s) => [
    s.sold_at, s.items.brand, s.items.name, s.platform,
    Number(s.sale_price), Number(s.fees), Number(s.shipping_cost), Number(s.item_cost_chf), Number(s.net_profit), s.shipping_status, s.tracking_number,
  ]);
  return csvResponse("vitrine-sales.csv", [
    ["sold_at", "brand", "name", "platform", "sale_price", "fees", "shipping_cost", "item_cost_chf", "net_profit", "shipping_status", "tracking_number"],
    ...rows,
  ]);
}
