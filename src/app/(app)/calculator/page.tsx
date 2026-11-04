import { CalculatorView } from "@/components/calculator-view";
import { getCompRows } from "@/lib/sales-data";
import { requireUser } from "@/lib/supabase/server";
import type { Platform } from "@/lib/types";

export const metadata = { title: "Max buy" };

export default async function CalculatorPage() {
  const { supabase } = await requireUser();
  const [{ data: platforms }, comps] = await Promise.all([
    supabase.from("platforms").select("*").order("name"),
    getCompRows(supabase),
  ]);
  return <CalculatorView platforms={(platforms ?? []) as Platform[]} comps={comps} />;
}
