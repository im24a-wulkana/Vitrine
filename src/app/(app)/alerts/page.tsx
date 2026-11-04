import Link from "next/link";
import { AlertRow } from "@/components/alert-row";
import { localDate } from "@/lib/format";
import { getAgingAlerts, getSettings } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Aging listings" };

export default async function AlertsPage() {
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const alerts = await getAgingAlerts(supabase, settings, localDate());

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="page-title">Aging listings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Listed or last repriced <span className="num">{settings.aging_threshold_days}</span>+ days ago. Each suggestion takes <span className="num">{Number(settings.markdown_percent)}%</span> off. <Link href="/settings" className="underline underline-offset-4">Change these</Link>
        </p>
      </header>
      {alerts.length === 0 ? (
        <p className="py-12 font-heading text-3xl">Nothing is sitting too long.</p>
      ) : (
        <ul>{alerts.map((a) => <AlertRow key={a.listing_id} alert={a} />)}</ul>
      )}
    </div>
  );
}
