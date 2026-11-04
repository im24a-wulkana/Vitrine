"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A toggle: tapping again on the same day removes the wear, so a mis-tap is undone in one tap. */
export async function logWear(itemId: string, wornOn: string): Promise<ActionResult<{ worn: boolean }>> {
  if (!DATE.test(wornOn)) return { ok: false, error: "Invalid date" };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: removed, error: deleteError } = await supabase
    .from("wears")
    .delete()
    .eq("item_id", itemId)
    .eq("worn_on", wornOn)
    .select("id");
  if (deleteError) return { ok: false, error: deleteError.message };

  const worn = !removed?.length;
  if (worn) {
    const { error } = await supabase.from("wears").insert({ item_id: itemId, worn_on: wornOn });
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/", "layout");
  return { ok: true, data: { worn } };
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

/** Logs a wear for every item in the outfit. Items already logged that day are left as they are. */
export async function wearOutfit(outfitId: string, wornOn: string): Promise<ActionResult> {
  if (!DATE.test(wornOn)) return { ok: false, error: "Invalid date" };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: rows, error: readError } = await supabase.from("outfit_items").select("item_id").eq("outfit_id", outfitId);
  if (readError) return { ok: false, error: readError.message };

  const { error } = await supabase
    .from("wears")
    .upsert((rows ?? []).map((r: { item_id: string }) => ({ item_id: r.item_id, worn_on: wornOn })), {
      onConflict: "item_id,worn_on",
      ignoreDuplicates: true,
    });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
