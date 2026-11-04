"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/supabase/server";
import type { ImportRow } from "@/lib/csv";
import type { ActionResult } from "@/lib/types";

/** Imports one batch all-or-nothing. If a step fails, the batch's items are removed again. */
export async function importBatch(rows: ImportRow[]): Promise<ActionResult<{ count: number }>> {
  if (rows.length > 500) return { ok: false, error: "Batch too large" };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const withIds = rows.map((row) => ({ row, id: randomUUID() }));
  const itemRows = withIds.map(({ row, id }) => {
    return {
      brand: row.brand,
      name: row.name,
      category: row.category,
      size: row.size,
      color: row.color,
      condition: row.condition,
      buy_price: row.buy_price,
      buy_currency: row.buy_currency,
      buy_price_chf: row.buy_price_chf,
      buy_date: row.buy_date,
      buy_source: row.buy_source,
      notes: row.notes,
      tags: row.tags,
      id,
      user_id: user.id,
      // Listings and sales are inserted next, and their triggers set the final status.
      status: row.status === "sold" || row.status === "listed" ? "in_stock" : row.status,
    };
  });

  const { error } = await supabase.from("items").insert(itemRows);
  if (error) return { ok: false, error: error.message };

  const rollback = async (message: string): Promise<ActionResult<{ count: number }>> => {
    await supabase.from("items").delete().in("id", withIds.map((x) => x.id));
    return { ok: false, error: message };
  };

  const listings = withIds.flatMap(({ row, id }) => (row.listing ? [{ item_id: id, ...row.listing }] : []));
  if (listings.length) {
    const { error: listingError } = await supabase.from("listings").insert(listings);
    if (listingError) return rollback(listingError.message);
  }

  const sales = withIds.flatMap(({ row, id }) => (row.sale ? [{ item_id: id, ...row.sale }] : []));
  if (sales.length) {
    const { error: saleError } = await supabase.from("sales").insert(sales);
    if (saleError) return rollback(saleError.message);
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { count: rows.length } };
}
