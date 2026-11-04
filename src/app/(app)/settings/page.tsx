import { SettingsView } from "@/components/settings-view";
import { isPushConfigured } from "@/lib/push/sender";
import { getSettings } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";
import type { Platform } from "@/lib/types";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const [settings, { data: platforms }] = await Promise.all([
    getSettings(supabase, user.id),
    supabase.from("platforms").select("*").order("name"),
  ]);
  return <SettingsView settings={settings} platforms={(platforms ?? []) as Platform[]} email={user.email ?? ""} pushConfigured={isPushConfigured()} />;
}
