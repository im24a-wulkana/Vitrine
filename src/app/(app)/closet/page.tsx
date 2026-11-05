import { ClosetView } from "@/components/closet-view";
import { localDate } from "@/lib/format";
import { isUnworn } from "@/lib/metrics";
import { requireUser } from "@/lib/session";
import type { ClosetItem, Platform } from "@/lib/types";

export const metadata = { title: "Closet" };

export default async function ClosetPage() {
  const { db } = await requireUser();
  const [{ data, error }, { data: platforms }, { data: outfits }] = await Promise.all([
    db
      .from("items")
      .select("*, item_images(*), listings(*), sales(*), wears(worn_on)")
      .order("created_at", { ascending: false })
      .limit(5000),
    db.from("platforms").select("*").order("name"),
    db.from("outfits").select("id, name").order("created_at", { ascending: false }),
  ]);
  if (error) throw new Error(error.message);

  const items = (data ?? []) as ClosetItem[];
  const today = localDate();
  const unwornCount = items.filter((i) => {
    if (i.status !== "personal") return false;
    const last = i.wears.map((w) => w.worn_on).sort().at(-1) ?? null;
    return isUnworn(last, i.buy_date ?? i.created_at, today);
  }).length;

  return <ClosetView items={items} platforms={(platforms ?? []) as Platform[]} outfits={outfits ?? []} unwornCount={unwornCount} />;
}
