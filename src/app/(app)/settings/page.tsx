import { SettingsView } from "@/components/settings-view";
import { isLocalMode } from "@/lib/mode";
import { isPushConfigured } from "@/lib/push/sender";
import { getSettings } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import type { Platform } from "@/lib/types";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { db, user } = await requireUser();
  const [settings, { data: platforms }] = await Promise.all([
    getSettings(db, user.id),
    db.from("platforms").select("*").order("name"),
  ]);
  return <SettingsView settings={settings} platforms={(platforms ?? []) as Platform[]} email={user.email ?? ""} pushConfigured={isPushConfigured()} localMode={isLocalMode} />;
}
