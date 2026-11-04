import { BatchForm } from "@/components/batch-form";
import { rankBrands } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Batch upload" };

export default async function BatchPage() {
  const { supabase } = await requireUser();
  const { data: rows } = await supabase.from("items").select("brand").limit(5000);
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="page-title">Batch</h1>
        <p className="mt-2 text-sm text-muted-foreground">Each photo becomes one item. Prices are in CHF.</p>
      </div>
      <BatchForm brands={rankBrands(rows ?? [])} />
    </div>
  );
}
