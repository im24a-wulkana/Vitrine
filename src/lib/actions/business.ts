"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const done: ActionResult = { ok: true, data: undefined };
const signedOut: ActionResult<never> = { ok: false, error: "Not signed in" };

function refresh() {
  revalidatePath("/", "layout");
}

// --- Cross-listing ---------------------------------------------------------

export async function confirmDelisted(listingIds: string[]): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return signedOut;
  if (listingIds.length === 0) return done;
  const { error } = await supabase.from("listings").update({ needs_delisting: false }).in("id", listingIds);
  if (error) return { ok: false, error: error.message };
  refresh();
  return done;
}

// --- Offers ----------------------------------------------------------------

const offerStatus = z.enum(["pending", "accepted", "declined", "countered"]);
const offerSchema = z.object({
  item_id: z.uuid(),
  platform_id: z.uuid().nullable(),
  amount_chf: z.number({ error: "Enter an amount" }).min(0, "Enter an amount"),
  status: offerStatus,
});

export async function addOffer(input: z.input<typeof offerSchema>): Promise<ActionResult> {
  const parsed = offerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid offer" };
  const { supabase, user } = await getUser();
  if (!user) return signedOut;
  const { error } = await supabase.from("offers").insert(parsed.data);
  if (error) return { ok: false, error: error.message };
  refresh();
  return done;
}

export async function setOfferStatus(id: string, status: string): Promise<ActionResult> {
  const parsed = offerStatus.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid status" };
  const { supabase, user } = await getUser();
  if (!user) return signedOut;
  const { error } = await supabase.from("offers").update({ status: parsed.data }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return done;
}

export async function deleteOffer(id: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return signedOut;
  const { error } = await supabase.from("offers").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return done;
}

// --- Shipping --------------------------------------------------------------

const shippingSchema = z.object({
  status: z.enum(["to_ship", "shipped", "delivered", "returned"]),
  tracking: z.string().trim().max(200).nullable(),
});

export async function updateShipping(saleId: string, input: z.input<typeof shippingSchema>): Promise<ActionResult> {
  const parsed = shippingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid shipping details" };
  const { supabase, user } = await getUser();
  if (!user) return signedOut;
  const { error } = await supabase
    .from("sales")
    .update({ shipping_status: parsed.data.status, tracking_number: parsed.data.tracking || null })
    .eq("id", saleId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return done;
}

// --- Lots ------------------------------------------------------------------

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const lotSchema = z.object({
  name: z.string().trim().min(1, "Give the lot a name").max(200),
  total_cost_chf: z.number({ error: "Enter the total cost" }).min(0, "Enter the total cost"),
  bought_at: z.preprocess(blankToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
  source: z.preprocess(blankToNull, z.string().trim().max(200).nullable()),
});

export async function createLot(input: z.input<typeof lotSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = lotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid lot" };
  const { supabase, user } = await getUser();
  if (!user) return signedOut;
  const { data, error } = await supabase.from("lots").insert({ ...parsed.data, user_id: user.id }).select("id").single();
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, data: { id: data.id as string } };
}

/** Changing the total re-splits it across the lot's items, in the database. */
export async function updateLot(id: string, input: z.input<typeof lotSchema>): Promise<ActionResult> {
  const parsed = lotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid lot" };
  const { supabase, user } = await getUser();
  if (!user) return signedOut;
  const { error } = await supabase.from("lots").update(parsed.data).eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return done;
}

/** Items stay, keeping the cost share they had. */
export async function deleteLot(id: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return signedOut;
  const { error } = await supabase.from("lots").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return done;
}

export async function assignToLot(lotId: string | null, itemIds: string[]): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return signedOut;
  if (itemIds.length === 0) return done;
  const { error } = await supabase.from("items").update({ lot_id: lotId }).in("id", itemIds);
  if (error) return { ok: false, error: error.message };
  refresh();
  return done;
}
