"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defaultPlacement } from "@/lib/outfits";
import { getUser } from "@/lib/session";
import { removePhotos } from "@/lib/storage";
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
  color_primary: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
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
  images: z
    .array(z.object({ url: z.string().min(1), original_url: z.string().min(1), cutout_url: z.string().min(1).nullable() }))
    .max(12)
    .default([]),
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
  const { db, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { images, listing, status, ...fields } = parsed.data;
  // When a listing is provided, inserting it moves the item to "listed".
  const { error } = await db
    .from("items")
    .insert({ ...fields, status: listing ? "in_stock" : status, user_id: user.id });
  if (error) return { ok: false, error: error.message };

  if (images.length) {
    const { error: imageError } = await db.from("item_images").insert(
      images.map((image, position) => ({ ...image, item_id: fields.id, position, is_primary: position === 0 })),
    );
    if (imageError) return { ok: false, error: imageError.message };
  }
  if (listing) {
    const { error: listingError } = await db.from("listings").insert({ item_id: fields.id, ...listing });
    if (listingError) return { ok: false, error: listingError.message };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { id: fields.id } };
}

export async function updateItem(id: string, input: UpdateItemInput): Promise<ActionResult> {
  const parsed = itemFields.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { db, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await db.from("items").update(parsed.data).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

type ImageFiles = { url: string; original_url: string | null; cutout_url: string | null };

function imageUrls(images: ImageFiles[]): (string | null)[] {
  return images.flatMap((i) => [i.url, i.original_url, i.cutout_url]);
}

export async function deleteItems(ids: string[]): Promise<ActionResult<{ count: number }>> {
  const { db, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: images } = await db.from("item_images").select("url, original_url, cutout_url").in("item_id", ids);
  const { data, error } = await db.from("items").delete().in("id", ids).select("id");
  if (error) return { ok: false, error: error.message };

  await removePhotos(user.id, imageUrls((images ?? []) as ImageFiles[]));

  revalidatePath("/", "layout");
  return { ok: true, data: { count: data?.length ?? 0 } };
}

const bulkStatus = z.enum(["personal", "in_stock", "listed"]);

/** Sold items are skipped: selling goes through recordSale, and undoing through undoSale. */
export async function bulkSetStatus(ids: string[], status: string): Promise<ActionResult<{ changed: number; skipped: number }>> {
  const parsed = bulkStatus.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Use Mark as sold to sell an item" };
  const { db, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data, error } = await db
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
  const { db, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data: existing } = await db.from("item_images").select("position").eq("item_id", itemId);
  const positions = (existing ?? []).map((i: { position: number }) => i.position);
  const { error } = await db.from("item_images").insert({
    item_id: itemId,
    url,
    original_url: url,
    position: positions.length ? Math.max(...positions) + 1 : 0,
    is_primary: positions.length === 0,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function removeImage(imageId: string): Promise<ActionResult> {
  const { db, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data: image, error } = await db.from("item_images").delete().eq("id", imageId).select().maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (image) {
    await removePhotos(user.id, imageUrls([image as ImageFiles]));
    if (image.is_primary) {
      const { data: next } = await db
        .from("item_images")
        .select("id")
        .eq("item_id", image.item_id)
        .order("position")
        .limit(1)
        .maybeSingle();
      if (next) await db.from("item_images").update({ is_primary: true }).eq("id", next.id);
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function setPrimaryImage(itemId: string, imageId: string): Promise<ActionResult> {
  const { db, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  // Clear first: a partial unique index allows only one primary per item.
  const { error: clearError } = await db.from("item_images").update({ is_primary: false }).eq("item_id", itemId);
  if (clearError) return { ok: false, error: clearError.message };
  const { error } = await db.from("item_images").update({ is_primary: true }).eq("id", imageId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function setFavorite(id: string, favorite: boolean): Promise<ActionResult> {
  const { db, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await db.from("items").update({ favorite }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

/** Adds to the end of the outfit. Adding an item it already contains changes nothing. */
export async function addToOutfit(outfitId: string, itemId: string): Promise<ActionResult> {
  const { db, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const [{ data: existing, error: readError }, { data: item }] = await Promise.all([
    db.from("outfit_items").select("position, z_index").eq("outfit_id", outfitId),
    db.from("items").select("category").eq("id", itemId).maybeSingle(),
  ]);
  if (readError) return { ok: false, error: readError.message };
  const rows = (existing ?? []) as { position: number; z_index: number }[];
  const positions = rows.map((row) => row.position);
  const { error } = await db
    .from("outfit_items")
    .upsert(
      { ...defaultPlacement(itemId, item?.category ?? null, rows), outfit_id: outfitId, position: positions.length ? Math.max(...positions) + 1 : 0 },
      { onConflict: "outfit_id,item_id", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outfits");
  return { ok: true, data: undefined };
}

/** Adds a finished cutout to a saved photo. It goes on display unless the user chose the original. */
export async function attachCutout(itemId: string, originalUrl: string, cutoutUrl: string, display: boolean): Promise<ActionResult> {
  const { db, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data, error } = await db
    .from("item_images")
    .update({ cutout_url: cutoutUrl, ...(display ? { url: cutoutUrl } : {}) })
    .eq("item_id", itemId)
    .eq("original_url", originalUrl)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    // The photo was deleted while its cutout was being made.
    await removePhotos(user.id, [cutoutUrl]);
  }
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function setImageVersion(imageId: string, version: "original" | "cutout"): Promise<ActionResult> {
  const { db, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data: image, error: readError } = await db.from("item_images").select("original_url, cutout_url").eq("id", imageId).maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  const url = version === "cutout" ? image?.cutout_url : image?.original_url;
  if (!url) return { ok: false, error: "That version isn't available" };
  const { error } = await db.from("item_images").update({ url }).eq("id", imageId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

/** Removes files for a photo taken off a form before the item was saved. */
export async function discardUploads(urls: string[]): Promise<void> {
  const { user } = await getUser();
  if (!user) return;
  await removePhotos(user.id, urls);
}
