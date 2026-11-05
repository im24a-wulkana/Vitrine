// Loads the sample data into a Neon database. Local mode doesn't need this, because
// it loads the sample data by itself on first run.
//
//   npm run seed            refuses to touch an account that already has items
//   npm run seed -- --reset deletes that account's data first
import { SAMPLE_ITEM_COUNT, seedSampleData } from "../src/lib/seed-data";
import { ensureAccount, need, owner } from "./lib";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("Running in local mode: sample data loads by itself on first run. To reload it, use Settings in the app.");
    return;
  }
  const email = need("SEED_USER_EMAIL");
  const { id: userId } = await ensureAccount(email, need("SEED_USER_PASSWORD"), "Sample account");
  const db = owner();

  const { count } = await db.from("items").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if ((count ?? 0) > 0 && !process.argv.includes("--reset")) {
    console.error(`${email} already has ${count} items. Nothing was changed. Re-run with --reset to replace them (npm run seed -- --reset).`);
    process.exit(1);
  }
  if (process.argv.includes("--reset")) {
    for (const table of ["push_log", "wear_logs", "items", "expenses", "outfits", "wishlist", "lots"]) {
      const { error } = await db.from(table).delete().eq("user_id", userId);
      if (error) throw new Error(`Clearing ${table} failed: ${error.message}`);
    }
  }

  await seedSampleData(db, userId);
  console.log(`Seeded ${SAMPLE_ITEM_COUNT} items for ${email}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
