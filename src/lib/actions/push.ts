"use server";

import { z } from "zod";
import { localDate } from "@/lib/format";
import { isPushEndpoint, runPushCheck } from "@/lib/push/check";
import { createPushSender, isPushConfigured } from "@/lib/push/sender";
import { getUser } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const subscriptionSchema = z.object({
  endpoint: z.string().max(2000).refine(isPushEndpoint, "That isn't a browser push service"),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
});

export async function savePushSubscription(input: z.input<typeof subscriptionSchema>): Promise<ActionResult> {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid subscription" };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase.from("push_subscriptions").upsert({ ...parsed.data, user_id: user.id }, { onConflict: "endpoint" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

export async function checkPushNow(): Promise<ActionResult<{ sent: number }>> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!isPushConfigured()) return { ok: false, error: "Notifications aren't set up." };
  try {
    const { sent } = await runPushCheck(supabase, user.id, localDate(), createPushSender());
    return { ok: true, data: { sent } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Check failed" };
  }
}
