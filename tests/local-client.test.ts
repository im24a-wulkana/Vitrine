// The query client must behave the same way for every call the app makes.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { createDbClient } from "../src/lib/db/client";
import { BOOTSTRAP_SQL, migrate } from "../src/lib/db/migrate";
import { LOCAL_PARSERS } from "../src/lib/db/parsers";
import { localRunner } from "../src/lib/local/db";
import { LOCAL_USER_ID } from "../src/lib/local/paths";
import { getSaleRows } from "../src/lib/sales-data";
import { seedSampleData, SAMPLE_ITEM_COUNT } from "../src/lib/seed-data";
import { getAgingAlerts, getSettings } from "../src/lib/queries";
import { summarize } from "../src/lib/metrics";

let db: PGlite;
let client: ReturnType<typeof createDbClient>;

before(async () => {
  db = new PGlite({ parsers: LOCAL_PARSERS });
  await db.exec(BOOTSTRAP_SQL);
  await migrate({ exec: (sql) => db.exec(sql), query: (sql, params) => db.query(sql, params) });
  await db.exec(`set request.jwt.sub = '${LOCAL_USER_ID}'`);
  await db.query(`insert into auth.users (id, email) values ($1, 'local')`, [LOCAL_USER_ID]);
  client = createDbClient(localRunner(db));
});

after(() => db.close());

beforeEach(async () => {
  await db.exec(`delete from public.wear_logs; delete from public.items; delete from public.expenses; delete from public.outfits; delete from public.wishlist;`);
});

async function item(fields: Record<string, unknown> = {}) {
  const { data, error } = await client.from("items").insert({ brand: "B", name: "N", buy_price: 100, ...fields }).select("id").single();
  assert.equal(error, null);
  return (data as { id: string }).id;
}

test("numbers come back as numbers and dates as strings", async () => {
  const id = await item({ buy_date: "2026-01-02" });
  const { data } = await client.from("items").select("*").eq("id", id).single();
  const row = data as { buy_price: number; buy_date: string; created_at: string; tags: string[] };
  assert.equal(row.buy_price, 100);
  assert.equal(row.buy_date, "2026-01-02");
  assert.match(row.created_at, /^\d{4}-\d{2}-\d{2}T.*Z$/);
  assert.deepEqual(row.tags, []);
});

test("a write without .select() returns null data", async () => {
  const { data, error } = await client.from("items").insert({ brand: "B", name: "N" });
  assert.equal(error, null);
  assert.equal(data, null);
});

test("array columns are stored and returned", async () => {
  const id = await item({ tags: ["wool", "winter, heavy"] });
  const { data } = await client.from("items").select("tags").eq("id", id).single();
  assert.deepEqual((data as { tags: string[] }).tags, ["wool", "winter, heavy"]);
});

test("embeds: one-to-many as arrays, one-to-one as an object or null, nested levels", async () => {
  const listed = await item();
  const plain = await item();
  const { data: listing } = await client.from("listings").insert({ item_id: listed, platform: "V", list_price: 100 }).select().single();
  await client.from("listings").update({ list_price: 90 }).eq("id", (listing as { id: string }).id);

  const { data } = await client.from("items").select("*, listings(*, price_changes(*)), sales(*), wears(worn_on)").order("created_at");
  const rows = data as { id: string; listings: { price_changes: unknown[] }[]; sales: unknown; wears: unknown[] }[];
  const a = rows.find((r) => r.id === listed)!;
  const b = rows.find((r) => r.id === plain)!;
  assert.equal(a.listings.length, 1);
  assert.equal(a.listings[0].price_changes.length, 1);
  assert.equal(a.sales, null);
  assert.deepEqual(b.listings, []);
  assert.deepEqual(b.wears, []);

  await client.from("sales").insert({ item_id: plain, platform: "V", sale_price: 150 });
  const { data: sold } = await client.from("items").select("sales(*)").eq("id", plain).single();
  assert.equal((sold as { sales: { net_profit: number } }).sales.net_profit, 50);
});

test("parent embeds with !inner return a single object", async () => {
  const id = await item({ brand: "Parent" });
  await client.from("sales").insert({ item_id: id, platform: "V", sale_price: 150 });
  const { data } = await client.from("sales").select("sale_price, items!inner(brand)");
  assert.deepEqual(data, [{ sale_price: 150, items: { brand: "Parent" } }]);
});

test("filters: eq, neq, in, is, order, limit, and an empty in()", async () => {
  await item({ name: "a", buy_price: 1 });
  const b = await item({ name: "b", buy_price: 2, status: "personal" });
  await item({ name: "c", buy_price: 3 });

  const names = async (q: PromiseLike<{ data: unknown }>) => ((await q).data as { name: string }[]).map((r) => r.name);
  assert.deepEqual(await names(client.from("items").select("name").neq("status", "personal").order("buy_price", { ascending: false })), ["c", "a"]);
  assert.deepEqual(await names(client.from("items").select("name").in("status", ["personal"])), ["b"]);
  assert.deepEqual(await names(client.from("items").select("name").eq("id", b)), ["b"]);
  assert.deepEqual(await names(client.from("items").select("name").order("name").limit(1)), ["a"]);
  assert.deepEqual(await names(client.from("items").select("name").in("id", [])), []);
  assert.deepEqual(await names(client.from("items").select("name").is("buy_date", null).order("name").limit(1)), ["a"]);
});

test("offers embed their platform, and a deleted platform leaves the offer in place", async () => {
  const id = await item();
  const { data: platform } = await client.from("platforms").insert({ user_id: LOCAL_USER_ID, name: "Temp" }).select("id").single();
  await client.from("offers").insert({ item_id: id, platform_id: (platform as { id: string }).id, amount_chf: 50 });
  const read = async () => ((await client.from("items").select("offers(amount_chf, status, platforms(name))").eq("id", id).single()).data as { offers: unknown[] }).offers;
  assert.deepEqual(await read(), [{ amount_chf: 50, status: "pending", platforms: { name: "Temp" } }]);
  await client.from("platforms").delete().eq("id", (platform as { id: string }).id);
  assert.deepEqual(await read(), [{ amount_chf: 50, status: "pending", platforms: null }]);
});

test("photos keep both versions, and existing rows can switch between them", async () => {
  const id = await item();
  const { data } = await client.from("item_images").insert({ item_id: id, url: "o.jpg", original_url: "o.jpg", is_primary: true }).select().single();
  const image = data as { id: string; cutout_url: string | null };
  assert.equal(image.cutout_url, null);
  await client.from("item_images").update({ cutout_url: "c.webp", url: "c.webp" }).eq("item_id", id).eq("original_url", "o.jpg");
  const { data: after } = await client.from("item_images").select("url, original_url, cutout_url").eq("id", image.id).single();
  assert.deepEqual(after, { url: "c.webp", original_url: "o.jpg", cutout_url: "c.webp" });
});

test("outfits keep their mode and each piece's placement", async () => {
  const id = await item();
  const { data } = await client.from("outfits").insert({ name: "Look", mode: "canvas", occasion: "Work", canvas_data: { version: 1 } }).select("id").single();
  const outfitId = (data as { id: string }).id;
  await client.from("outfit_items").insert({ outfit_id: outfitId, item_id: id, position: 0, x: 0.25, y: 0.75, scale: 0.4, rotation: -12.5, z_index: 3 });
  const { data: read } = await client.from("outfits").select("mode, occasion, canvas_data, outfit_items(x, y, scale, rotation, z_index)").eq("id", outfitId).single();
  assert.deepEqual(read, { mode: "canvas", occasion: "Work", canvas_data: { version: 1 }, outfit_items: [{ x: 0.25, y: 0.75, scale: 0.4, rotation: -12.5, z_index: 3 }] });
});

test("date ranges filter inclusively", async () => {
  await client.from("expenses").insert([
    { category: "x", amount_chf: 1, date: "2026-01-01" },
    { category: "x", amount_chf: 2, date: "2026-01-15" },
    { category: "x", amount_chf: 3, date: "2026-02-01" },
  ]);
  const { data } = await client.from("expenses").select("amount_chf").gte("date", "2026-01-15").lte("date", "2026-02-01").order("date");
  assert.deepEqual(data, [{ amount_chf: 2 }, { amount_chf: 3 }]);
});

test("wear logs store arrays and weather, and upsert by day", async () => {
  const id = await item();
  const weather = { temp: 6, high: 7, low: 5, code: 2, label: "Partly cloudy" };
  await client.from("wear_logs").upsert({ user_id: LOCAL_USER_ID, date: "2026-03-01", item_ids: [id], weather }, { onConflict: "user_id,date" });
  await client.from("wear_logs").upsert({ user_id: LOCAL_USER_ID, date: "2026-03-01", item_ids: [] }, { onConflict: "user_id,date" });
  const { data } = await client.from("wear_logs").select("date, item_ids, weather").eq("date", "2026-03-01").single();
  assert.deepEqual(data, { date: "2026-03-01", item_ids: [], weather });
  await client.from("wear_logs").delete().eq("date", "2026-03-01");
});

test("single and maybeSingle follow their rules", async () => {
  const missing = "00000000-0000-4000-8000-0000000000ff";
  assert.equal((await client.from("items").select("*").eq("id", missing).maybeSingle()).data, null);
  assert.equal((await client.from("items").select("*").eq("id", missing).maybeSingle()).error, null);
  assert.ok((await client.from("items").select("*").eq("id", missing).single()).error);
});

test("head count returns only the count", async () => {
  await item();
  await item();
  const { data, count } = await client.from("items").select("id", { count: "exact", head: true }).eq("user_id", LOCAL_USER_ID);
  assert.equal(data, null);
  assert.equal(count, 2);
});

test("errors come back as values with the Postgres code, not thrown", async () => {
  const id = await item();
  await client.from("sales").insert({ item_id: id, platform: "V", sale_price: 1 });
  const { error } = await client.from("sales").insert({ item_id: id, platform: "V", sale_price: 2 });
  assert.equal(error?.code, "23505");
});

test("trigger errors reach the app", async () => {
  const { error } = await client.from("items").insert({ brand: "B", name: "N", status: "sold" });
  assert.match(error?.message ?? "", /record a sale/);
});

test("upsert updates on conflict; ignoreDuplicates leaves the row alone", async () => {
  await client.from("user_settings").upsert({ user_id: LOCAL_USER_ID, aging_threshold_days: 45 });
  assert.equal((await getSettings(client, LOCAL_USER_ID)).aging_threshold_days, 45);
  await client.from("user_settings").upsert({ user_id: LOCAL_USER_ID, aging_threshold_days: 30 });

  const id = await item();
  const wear = { item_id: id, worn_on: "2026-01-01" };
  await client.from("wears").upsert([wear], { onConflict: "item_id,worn_on", ignoreDuplicates: true });
  const again = await client.from("wears").upsert([wear], { onConflict: "item_id,worn_on", ignoreDuplicates: true });
  assert.equal(again.error, null);
  assert.equal(((await client.from("wears").select("*").eq("item_id", id)).data as unknown[]).length, 1);
});

test("multi-row inserts fill missing columns with defaults", async () => {
  const { error } = await client.from("items").insert([{ brand: "A", name: "1", size: "M" }, { brand: "B", name: "2" }]);
  assert.equal(error, null);
});

test("the sample data loads, with the expected mix of statuses and working dashboard queries", async () => {
  await seedSampleData(client, LOCAL_USER_ID);
  const { data } = await client.from("items").select("status");
  const counts: Record<string, number> = {};
  for (const { status } of data as { status: string }[]) counts[status] = (counts[status] ?? 0) + 1;
  assert.equal((data as unknown[]).length, SAMPLE_ITEM_COUNT);
  assert.deepEqual(counts, { personal: 5, in_stock: 1, listed: 4, sold: 5 });

  const sales = await getSaleRows(client);
  assert.equal(sales.length, 5);
  assert.ok(sales.every((s) => s.started_at && typeof s.net_profit === "number"));
  assert.ok(summarize(sales, [], "all", "2030-01-01").avgDaysToSell! > 0);

  const today = new Date().toISOString().slice(0, 10);
  const alerts = await getAgingAlerts(client, await getSettings(client, LOCAL_USER_ID), today);
  assert.deepEqual(alerts.map((a) => a.name).sort(), ["Shell parka", "Twisted trousers"]);
});
