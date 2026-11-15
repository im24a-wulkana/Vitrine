// Creates or refreshes the public demo account's sample data: npm run demo:seed
// The app only ever reads it, through a read-only connection.
import { DEMO_EMAIL, DEMO_USER_ID } from "../src/lib/demo";
import { ownerRunner } from "../src/lib/db/neon";
import { SAMPLE_ITEM_COUNT, seedSampleData } from "../src/lib/seed-data";
import { need, owner } from "./lib";

async function main() {
  need("DATABASE_URL");
  const run = ownerRunner();
  await run.query(`insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing`, [DEMO_USER_ID, DEMO_EMAIL]);

  // Starts over, so the sample dates stay recent.
  for (const table of ["push_log", "wear_logs", "items", "expenses", "outfits", "wishlist", "lots"]) {
    await run.query(`delete from public.${table} where user_id = $1`, [DEMO_USER_ID]);
  }
  await seedSampleData(owner(), DEMO_USER_ID);
  console.log(`Demo account refreshed with ${SAMPLE_ITEM_COUNT} items.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
