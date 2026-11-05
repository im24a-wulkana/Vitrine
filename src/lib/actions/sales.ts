"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/session";
import type { ActionResult } from "@/lib/types";

const saleSchema = z.object({
  item_id: z.uuid(),
  platform: z.string().trim().min(1, "Choose a platform"),
  sale_price: z.number().min(0),
  fees: z.number().min(0),
  shipping_cost: z.number().min(0),
  sold_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function recordSale(input: z.input<typeof saleSchema>): Promise<ActionResult<{ toDelist: { id: string; platform: string }[] }>> {
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid sale" };
  const { db, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await db.from("sales").insert(parsed.data);
  if (error) {
    return { ok: false, error: error.code === "23505" ? "This item already has a sale" : error.message };
  }
  const { data: toDelist } = await db
    .from("listings")
    .select("id, platform")
    .eq("item_id", parsed.data.item_id)
    .eq("needs_delisting", true);
  revalidatePath("/", "layout");
  return { ok: true, data: { toDelist: toDelist ?? [] } };
}

export async function undoSale(itemId: string): Promise<ActionResult> {
  const { db, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await db.from("sales").delete().eq("item_id", itemId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

const listingSchema = z.object({
  item_id: z.uuid(),
  platform: z.string().trim().min(1, "Choose a platform"),
  list_price: z.number().min(0).nullable(),
});

export async function createListing(input: z.input<typeof listingSchema>): Promise<ActionResult> {
  const parsed = listingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid listing" };
  const { db, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await db.from("listings").insert(parsed.data);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

/** Also used for a one-tap markdown. A database trigger records the price change. */
export async function updateListingPrice(listingId: string, price: number): Promise<ActionResult> {
  if (!(price >= 0)) return { ok: false, error: "Enter a valid price" };
  const { db, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await db.from("listings").update({ list_price: price }).eq("id", listingId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function closeListing(listingId: string): Promise<ActionResult> {
  const { db, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await db.from("listings").update({ delisted_at: new Date().toISOString() }).eq("id", listingId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
