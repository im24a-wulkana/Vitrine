"use server";

import { rmSync } from "node:fs";
import { revalidatePath } from "next/cache";
import { LOCAL_UPLOAD_DIR } from "@/lib/local/paths";
import { isLocalMode } from "@/lib/mode";
import { seedSampleData } from "@/lib/seed-data";
import { getUser } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

/** Local mode only: wipes this computer's data, then optionally loads the sample data. */
export async function resetLocalData(withSample: boolean): Promise<ActionResult> {
  if (!isLocalMode) return { ok: false, error: "Only available in local mode" };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  try {
    for (const table of ["items", "expenses", "outfits", "wishlist"]) {
      const { error } = await supabase.from(table).delete().eq("user_id", user.id);
      if (error) return { ok: false, error: error.message };
    }
    rmSync(LOCAL_UPLOAD_DIR, { recursive: true, force: true });
    if (withSample) await seedSampleData(supabase, user.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Reset failed" };
  }
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
