import { Nav } from "@/components/nav";
import { BackButton, InstallHint } from "@/components/phone-shell";
import { ThemeSync } from "@/components/theme-sync";
import { localDate } from "@/lib/format";
import { getAgingAlerts, getSettings } from "@/lib/queries";
import { requireUser } from "@/lib/session";

// Always render per request. In local mode nothing reads cookies, so Next would
// otherwise prerender these pages at build time and serve stale data.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { db, user } = await requireUser();
  const settings = await getSettings(db, user.id);
  const [alerts, { count: toShip }] = await Promise.all([
    getAgingAlerts(db, settings, localDate()),
    db.from("sales").select("id", { count: "exact", head: true }).eq("shipping_status", "to_ship"),
  ]);

  return (
    <>
      <ThemeSync theme={settings.theme} />
      <Nav alertCount={alerts.length + (toShip ?? 0)} />
      <div className="md:pl-56">
        <main className="app-main mx-auto max-w-6xl">
          <BackButton />
          <InstallHint />
          {children}
        </main>
      </div>
    </>
  );
}
