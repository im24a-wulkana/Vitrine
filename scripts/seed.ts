// Loads the sample data into a Supabase project. Local mode doesn't need this,
// because it loads the sample data by itself on first run.
//
//   npm run seed            refuses to touch an account that already has items
//   npm run seed -- --reset deletes that account's items, expenses, outfits and
//                           wishlist first
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { SAMPLE_ITEM_COUNT, seedSampleData } from "../src/lib/seed-data";

config({ path: ".env.local" });

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.log("Running in local mode: sample data loads by itself on first run. To reload it, use Settings in the app.");
  process.exit(0);
}

function need(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Add it to .env.local (see .env.example).`);
    process.exit(1);
  }
  return value;
}

const supabase = createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const email = need("SEED_USER_EMAIL");
const password = need("SEED_USER_PASSWORD");
const reset = process.argv.includes("--reset");

async function findOrCreateUser(): Promise<string> {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const existing = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (existing) return existing.id;
    if (data.users.length < 200) break;
  }
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  const userId = await findOrCreateUser();

  const { count } = await supabase.from("items").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if ((count ?? 0) > 0 && !reset) {
    console.error(`${email} already has ${count} items. Nothing was changed. Re-run with --reset to replace them (npm run seed -- --reset).`);
    process.exit(1);
  }
  if (reset) {
    for (const table of ["items", "expenses", "outfits", "wishlist"]) {
      const { error } = await supabase.from(table).delete().eq("user_id", userId);
      if (error) throw new Error(`Clearing ${table} failed: ${error.message}`);
    }
  }

  await seedSampleData(supabase, userId);
  console.log(`Seeded ${SAMPLE_ITEM_COUNT} items for ${email}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
