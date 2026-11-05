import { InsightsView } from "@/components/insights-view";
import { localDate } from "@/lib/format";
import type { InsightItem } from "@/lib/insights";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Insights" };

export default async function InsightsPage() {
  const { db } = await requireUser();
  const { data, error } = await db
    .from("items")
    .select("id, brand, name, category, color, colors, buy_price_chf, buy_date, created_at, wears(worn_on)")
    .eq("status", "personal")
    .limit(5000);
  if (error) throw new Error(error.message);
  return <InsightsView items={(data ?? []) as InsightItem[]} today={localDate()} />;
}
