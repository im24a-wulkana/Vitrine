import { Nav } from "@/components/nav";
import { localDate } from "@/lib/format";
import { getAgingAlerts, getSettings } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const alerts = await getAgingAlerts(supabase, settings, localDate());

  return (
    <>
      <Nav alertCount={alerts.length} />
      <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 md:px-6 md:pb-12">{children}</main>
    </>
  );
}
