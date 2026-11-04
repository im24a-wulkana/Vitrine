"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

type LogRow = { id: string; item_ids: string[]; outfit_id: string | null; photo_url: string | null };

/**
 * A toggle: tapping again on the same day removes the wear, so a mis-tap is undone
 * in one tap. Writes to the day's log, and a database trigger updates wears.
 */
export async function logWear(itemId: string, wornOn: string): Promise<ActionResult<{ worn: boolean }>> {
  if (!DATE.test(wornOn)) return { ok: false, error: "Invalid date" };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data, error: readError } = await supabase.from("wear_logs").select("id, item_ids, outfit_id, photo_url").eq("date", wornOn).maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  const log = data as LogRow | null;

  const worn = !log?.item_ids.includes(itemId);
  const itemIds = worn ? [...(log?.item_ids ?? []), itemId] : (log?.item_ids ?? []).filter((id) => id !== itemId);

  const { error } =
    !worn && itemIds.length === 0 && !log?.photo_url && !log?.outfit_id
      ? await supabase.from("wear_logs").delete().eq("id", log?.id as string)
      : await supabase.from("wear_logs").upsert({ user_id: user.id, date: wornOn, item_ids: itemIds }, { onConflict: "user_id,date" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: { worn } };
}

const weatherSchema = z.object({ temp: z.number(), high: z.number(), low: z.number(), code: z.number(), label: z.string().max(60) });

const wearLogSchema = z.object({
  date: z.string().regex(DATE, "Invalid date"),
  outfit_id: z.uuid().nullable(),
  item_ids: z.array(z.uuid()).max(60),
  photo_url: z.string().min(1).max(2000).nullable(),
  weather: weatherSchema.nullable(),
});

function photoPath(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("/api/local-files/")) return url.slice("/api/local-files/".length);
  const marker = "/storage/v1/object/public/item-images/";
  const at = url.indexOf(marker);
  return at === -1 ? null : decodeURIComponent(url.slice(at + marker.length));
}

/** Saves the whole day. There's one log per day, so this replaces what was there. */
export async function saveWearLog(input: z.input<typeof wearLogSchema>): Promise<ActionResult> {
  const parsed = wearLogSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid log" };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: existing } = await supabase.from("wear_logs").select("photo_url").eq("date", parsed.data.date).maybeSingle();
  const { error } = await supabase.from("wear_logs").upsert({ ...parsed.data, user_id: user.id }, { onConflict: "user_id,date" });
  if (error) return { ok: false, error: error.message };

  const oldPhoto = (existing as { photo_url: string | null } | null)?.photo_url ?? null;
  const oldPath = oldPhoto !== parsed.data.photo_url ? photoPath(oldPhoto) : null;
  if (oldPath) await supabase.storage.from("item-images").remove([oldPath]);

  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function deleteWearLog(id: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data, error } = await supabase.from("wear_logs").delete().eq("id", id).select("photo_url").maybeSingle();
  if (error) return { ok: false, error: error.message };
  const path = photoPath((data as { photo_url: string | null } | null)?.photo_url ?? null);
  if (path) await supabase.storage.from("item-images").remove([path]);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

const placementSchema = z.object({
  item_id: z.uuid(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  scale: z.number().positive().max(4),
  rotation: z.number().finite(),
  z_index: z.number().int().min(0),
});

const outfitSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Give the outfit a name").max(200),
  occasion: z.string().trim().max(60).nullable(),
  mode: z.enum(["canvas", "slots"]),
  placements: z.array(placementSchema).min(1, "Pick at least one item").max(40),
});

export async function saveOutfit(input: z.input<typeof outfitSchema>): Promise<ActionResult> {
  const parsed = outfitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid outfit" };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { name, occasion, mode, placements } = parsed.data;
  const fields = { name, occasion, mode, canvas_data: { version: 1 } };
  let outfitId = parsed.data.id;
  if (outfitId) {
    const { error } = await supabase.from("outfits").update(fields).eq("id", outfitId);
    if (error) return { ok: false, error: error.message };
    const { error: clearError } = await supabase.from("outfit_items").delete().eq("outfit_id", outfitId);
    if (clearError) return { ok: false, error: clearError.message };
  } else {
    const { data, error } = await supabase.from("outfits").insert({ ...fields, user_id: user.id }).select("id").single();
    if (error) return { ok: false, error: error.message };
    outfitId = data.id as string;
  }

  const { error } = await supabase
    .from("outfit_items")
    .insert(placements.map((placement, position) => ({ ...placement, outfit_id: outfitId, position })));
  if (error) return { ok: false, error: error.message };

  revalidatePath("/outfits");
  return { ok: true, data: undefined };
}

export async function deleteOutfit(id: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase.from("outfits").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outfits");
  return { ok: true, data: undefined };
}

/** Logs the outfit for that day, adding to anything already logged. */
export async function wearOutfit(outfitId: string, wornOn: string): Promise<ActionResult> {
  if (!DATE.test(wornOn)) return { ok: false, error: "Invalid date" };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const [{ data: rows, error: readError }, { data: log }] = await Promise.all([
    supabase.from("outfit_items").select("item_id").eq("outfit_id", outfitId),
    supabase.from("wear_logs").select("item_ids").eq("date", wornOn).maybeSingle(),
  ]);
  if (readError) return { ok: false, error: readError.message };

  const existing = (log as { item_ids: string[] } | null)?.item_ids ?? [];
  const itemIds = [...new Set([...existing, ...(rows ?? []).map((r: { item_id: string }) => r.item_id)])];
  const { error } = await supabase
    .from("wear_logs")
    .upsert({ user_id: user.id, date: wornOn, outfit_id: outfitId, item_ids: itemIds }, { onConflict: "user_id,date" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
