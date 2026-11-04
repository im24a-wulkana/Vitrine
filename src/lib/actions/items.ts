"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optionalText = z.preprocess(blankToNull, z.string().trim().max(2000).nullable().optional());

const itemFields = z.object({
  brand: z.string().trim().min(1, "Brand is required").max(200),
  name: z.string().trim().min(1, "Name is required").max(300),
  category: optionalText,
  size: optionalText,
  color: optionalText,
  condition: z.number().int().min(1).max(10).nullable().optional(),
  buy_price: z.number().min(0),
  buy_currency: z.string().regex(/^[A-Z]{3}$/),
  buy_price_chf: z.number().min(0),
  buy_date: z.preprocess(blankToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
  buy_source: optionalText,
  notes: optionalText,
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  subcategory: optionalText,
  colors: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  seasons: z.array(z.string().max(30)).max(4).default([]),
  occasions: z.array(z.string().max(30)).max(12).default([]),
  storage_location: optionalText,
  measurements: z.record(z.string(), z.number().min(0)).default({}),
  favorite: z.boolean().default(false),
});

const createSchema = itemFields.extend({
  id: z.uuid(),
  status: z.enum(["personal", "in_stock", "listed"]),
  images: z.array(z.string().min(1)).max(12).default([]),
  listing: z.object({ platform: z.string().trim().min(1), list_price: z.number().min(0).nullable() }).optional(),
});

export type CreateItemInput = z.input<typeof createSchema>;
export type UpdateItemInput = z.input<typeof itemFields>;

function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid input";
}

export async function createItem(input: CreateItemInput): Promise<ActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { images, listing, status, ...fields } = parsed.data;
  // When a listing is provided, inserting it moves the item to "listed".
  const { error } = await supabase
    .from("items")
    .insert({ ...fields, status: listing ? "in_stock" : status, user_id: user.id });
  if (error) return { ok: false, error: error.message };

  if (images.length) {
    const { error: imageError } = await supabase.from("item_images").insert(
      images.map((url, position) => ({ item_id: fields.id, url, position, is_primary: position === 0 })),
    );
    if (imageError) return { ok: false, error: imageError.message };
  }
  if (listing) {
    const { error: listingError } = await supabase.from("listings").insert({ item_id: fields.id, ...listing });
    if (listingError) return { ok: false, error: listingError.message };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { id: fields.id } };
}

export async function updateItem(id: string, input: UpdateItemInput): Promise<ActionResult> {
  const parsed = itemFields.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await supabase.from("items").update(parsed.data).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

function storagePath(url: string): string | null {
  if (url.startsWith("/api/local-files/")) return url.slice("/api/local-files/".length);
  const marker = "/storage/v1/object/public/item-images/";
  const at = url.indexOf(marker);
  return at === -1 ? null : decodeURIComponent(url.slice(at + marker.length));
}

export async function deleteItems(ids: string[]): Promise<ActionResult<{ count: number }>> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: images } = await supabase.from("item_images").select("url").in("item_id", ids);
  const { data, error } = await supabase.from("items").delete().in("id", ids).select("id");
  if (error) return { ok: false, error: error.message };

  const paths = (images ?? []).map((i: { url: string }) => storagePath(i.url)).filter((p: string | null): p is string => p !== null);
  if (paths.length) await supabase.storage.from("item-images").remove(paths);

  revalidatePath("/", "layout");
  return { ok: true, data: { count: data?.length ?? 0 } };
}

const bulkStatus = z.enum(["personal", "in_stock", "listed"]);

/** Sold items are skipped: selling goes through recordSale, and undoing through undoSale. */
export async function bulkSetStatus(ids: string[], status: string): Promise<ActionResult<{ changed: number; skipped: number }>> {
  const parsed = bulkStatus.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Use Mark as sold to sell an item" };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data, error } = await supabase
    .from("items")
    .update({ status: parsed.data })
    .in("id", ids)
    .neq("status", "sold")
    .select("id");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  const changed = data?.length ?? 0;
  return { ok: true, data: { changed, skipped: ids.length - changed } };
}

export async function addImage(itemId: string, url: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data: existing } = await supabase.from("item_images").select("position").eq("item_id", itemId);
  const positions = (existing ?? []).map((i: { position: number }) => i.position);
  const { error } = await supabase.from("item_images").insert({
    item_id: itemId,
    url,
    position: positions.length ? Math.max(...positions) + 1 : 0,
    is_primary: positions.length === 0,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function removeImage(imageId: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data: image, error } = await supabase.from("item_images").delete().eq("id", imageId).select().maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (image) {
    const path = storagePath(image.url);
    if (path) await supabase.storage.from("item-images").remove([path]);
    if (image.is_primary) {
      const { data: next } = await supabase
        .from("item_images")
        .select("id")
        .eq("item_id", image.item_id)
        .order("position")
        .limit(1)
        .maybeSingle();
      if (next) await supabase.from("item_images").update({ is_primary: true }).eq("id", next.id);
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function setPrimaryImage(itemId: string, imageId: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  // Clear first: a partial unique index allows only one primary per item.
  const { error: clearError } = await supabase.from("item_images").update({ is_primary: false }).eq("item_id", itemId);
  if (clearError) return { ok: false, error: clearError.message };
  const { error } = await supabase.from("item_images").update({ is_primary: true }).eq("id", imageId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function setFavorite(id: string, favorite: boolean): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase.from("items").update({ favorite }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

/** Adds to the end of the outfit. Adding an item it already contains changes nothing. */
export async function addToOutfit(outfitId: string, itemId: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data: existing, error: readError } = await supabase.from("outfit_items").select("position").eq("outfit_id", outfitId);
  if (readError) return { ok: false, error: readError.message };
  const positions = (existing ?? []).map((row: { position: number }) => row.position);
  const { error } = await supabase
    .from("outfit_items")
    .upsert(
      { outfit_id: outfitId, item_id: itemId, position: positions.length ? Math.max(...positions) + 1 : 0 },
      { onConflict: "outfit_id,item_id", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outfits");
  return { ok: true, data: undefined };
}
