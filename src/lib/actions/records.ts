"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optionalText = z.preprocess(blankToNull, z.string().trim().max(2000).nullable().optional());

function fail(error: z.ZodError): ActionResult<never> {
  return { ok: false, error: error.issues[0]?.message ?? "Invalid input" };
}
const done: ActionResult = { ok: true, data: undefined };
const signedOut: ActionResult<never> = { ok: false, error: "Not signed in" };

// --- Expenses --------------------------------------------------------------

const expenseSchema = z.object({
  category: z.string().trim().min(1, "Choose a category").max(100),
  amount_chf: z.number({ error: "Enter an amount" }).min(0, "Enter an amount"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  note: optionalText,
});

export async function addExpense(input: z.input<typeof expenseSchema>): Promise<ActionResult> {
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const { supabase, user } = await getUser();
  if (!user) return signedOut;
  const { error } = await supabase.from("expenses").insert({ ...parsed.data, user_id: user.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return done;
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return signedOut;
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return done;
}

// --- Wishlist --------------------------------------------------------------

const wishSchema = z.object({
  brand: optionalText,
  name: z.string().trim().min(1, "Name is required").max(300),
  target_price: z.number().min(0).nullable(),
  // Links render as anchors, so only web URLs are allowed. This rules out javascript: links.
  link: z.preprocess(blankToNull, z.url({ protocol: /^https?$/, error: "Link must start with http:// or https://" }).nullable().optional()),
  notes: optionalText,
});

export async function addWish(input: z.input<typeof wishSchema>): Promise<ActionResult> {
  const parsed = wishSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const { supabase, user } = await getUser();
  if (!user) return signedOut;
  const { error } = await supabase.from("wishlist").insert({ ...parsed.data, user_id: user.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/wishlist");
  return done;
}

export async function deleteWish(id: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return signedOut;
  const { error } = await supabase.from("wishlist").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/wishlist");
  return done;
}

// --- Settings --------------------------------------------------------------

const settingsSchema = z.object({
  default_currency: z.string().regex(/^[A-Z]{3}$/),
  aging_threshold_days: z.number().int().min(1, "Threshold must be at least 1 day").max(3650),
  markdown_percent: z.number().gt(0, "Markdown must be above 0%").lt(100, "Markdown must be below 100%"),
  monthly_profit_goal_chf: z.number().min(0, "The goal can't be negative").nullable(),
});

export async function saveSettings(input: z.input<typeof settingsSchema>): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const { supabase, user } = await getUser();
  if (!user) return signedOut;
  const { error } = await supabase.from("user_settings").upsert({ ...parsed.data, user_id: user.id, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return done;
}

const platformSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Platform name is required").max(100),
  fee_percent: z.number().min(0, "Fee must be 0–100%").max(100, "Fee must be 0–100%"),
  fee_fixed: z.number().min(0, "Fixed fee can't be negative"),
});

export async function savePlatform(input: z.input<typeof platformSchema>): Promise<ActionResult> {
  const parsed = platformSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const { supabase, user } = await getUser();
  if (!user) return signedOut;
  const { id, ...fields } = parsed.data;
  const { error } = id
    ? await supabase.from("platforms").update(fields).eq("id", id)
    : await supabase.from("platforms").insert({ ...fields, user_id: user.id });
  if (error) {
    return { ok: false, error: error.code === "23505" ? "You already have a platform with this name" : error.message };
  }
  revalidatePath("/", "layout");
  return done;
}

/** Past sales and listings keep the platform name as text, so they are unaffected. */
export async function deletePlatform(id: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return signedOut;
  const { error } = await supabase.from("platforms").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return done;
}

export async function signOut(): Promise<void> {
  const { supabase } = await getUser();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
}
