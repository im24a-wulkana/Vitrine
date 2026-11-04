import { ItemForm } from "@/components/item-form";
import { rankBrands } from "@/lib/format";
import { getSettings } from "@/lib/queries";
import { getCompRows } from "@/lib/sales-data";
import { requireUser } from "@/lib/supabase/server";
import type { Platform } from "@/lib/types";

export const metadata = { title: "Add item" };

export default async function NewItemPage() {
  const { supabase, user } = await requireUser();
  const [{ data: rows }, { data: platforms }, settings, comps] = await Promise.all([
    supabase.from("items").select("brand").limit(5000),
    supabase.from("platforms").select("*").order("name"),
    getSettings(supabase, user.id),
    getCompRows(supabase),
  ]);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="page-title">Add item</h1>
      <ItemForm brands={rankBrands(rows ?? [])} platforms={(platforms ?? []) as Platform[]} defaultCurrency={settings.default_currency} comps={comps} />
    </div>
  );
}
