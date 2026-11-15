"use server";

import { tradeCost } from "@/lib/metrics";
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

  // Undoing a trade also removes the item that came in it, unless that one has moved on.
  const { data: sale } = await db.from("sales").select("kind, traded_for, previous_status").eq("item_id", itemId).maybeSingle();
  const trade = (sale as { kind?: string; traded_for?: string | null; previous_status?: string | null } | null)?.kind === "trade" ? (sale as { traded_for: string | null; previous_status: string | null }) : null;
  const received = trade?.traded_for ?? null;
  if (received) {
    const { data: other } = await db.from("items").select("status").eq("id", received).maybeSingle();
    if ((other as { status?: string } | null)?.status === "sold") {
      return { ok: false, error: "What you got in this trade has been sold or traded on, so the trade can't be undone." };
    }
  }

  const { error } = await db.from("sales").delete().eq("item_id", itemId);
  if (error) return { ok: false, error: error.message };
  if (received) await db.from("items").delete().eq("id", received);
  // Undoing returns an item to stock, which is wrong for something you'd kept for yourself.
  if (trade?.previous_status === "personal") await db.from("items").update({ status: "personal" }).eq("id", itemId);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

const tradeSchema = z.object({
  item_id: z.uuid(),
  brand: z.string().trim().min(1, "Enter the brand of what you got"),
  name: z.string().trim().min(1, "Enter what you got"),
  category: z.string().trim().nullable(),
  size: z.string().trim().nullable(),
  status: z.enum(["personal", "in_stock"]),
  cash_paid: z.number().min(0),
  cash_received: z.number().min(0),
  traded_at: z.iso.date(),
  needs_shipping: z.boolean(),
});

/**
 * Swaps an item for a new one. The new item carries the old one's cost, adjusted for
 * any cash, and the old one is closed with a trade that shows no profit.
 */
export async function tradeItem(input: z.input<typeof tradeSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = tradeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the trade details" };
  const { db, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const t = parsed.data;

  const { data: found } = await db.from("items").select("id, brand, name, status, buy_price_chf").eq("id", t.item_id).maybeSingle();
  const old = found as { brand: string; name: string; status: string; buy_price_chf: number } | null;
  if (!old) return { ok: false, error: "That item no longer exists" };
  if (old.status === "sold") return { ok: false, error: "This item is already sold or traded" };

  const cost = tradeCost(old.buy_price_chf, t.cash_paid, t.cash_received);
  const { data: created, error: createError } = await db
    .from("items")
    .insert({
      user_id: user.id,
      brand: t.brand,
      name: t.name,
      category: t.category,
      size: t.size,
      status: t.status,
      buy_price: cost,
      buy_currency: "CHF",
      buy_price_chf: cost,
      buy_date: t.traded_at,
      buy_source: "Trade",
      notes: `Traded for my ${old.brand} ${old.name}.`,
    })
    .select("id")
    .single();
  if (createError || !created) return { ok: false, error: createError?.message ?? "Couldn't save what you got" };
  const newId = (created as { id: string }).id;

  const { error: tradeError } = await db.from("sales").insert({
    item_id: t.item_id,
    platform: "Trade",
    sale_price: Number(old.buy_price_chf),
    fees: 0,
    shipping_cost: 0,
    sold_at: t.traded_at,
    kind: "trade",
    traded_for: newId,
    previous_status: old.status,
    shipping_status: t.needs_shipping ? "to_ship" : "delivered",
  });
  if (tradeError) {
    // Without the trade, the new item shouldn't exist either.
    await db.from("items").delete().eq("id", newId);
    return { ok: false, error: tradeError.code === "23505" ? "This item already has a sale" : tradeError.message };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { id: newId } };
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
