import { CalculatorView } from "@/components/calculator-view";
import { getCompRows } from "@/lib/sales-data";
import { requireUser } from "@/lib/session";
import type { Platform } from "@/lib/types";

export const metadata = { title: "Max buy" };

export default async function CalculatorPage() {
  const { db } = await requireUser();
  const [{ data: platforms }, comps] = await Promise.all([
    db.from("platforms").select("*").order("name"),
    getCompRows(db),
  ]);
  return <CalculatorView platforms={(platforms ?? []) as Platform[]} comps={comps} />;
}
