// Runs the real migrations against PGlite (Postgres in WASM), with a small stub
// standing in for the auth and storage schemas that Supabase provides.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { SUPABASE_STUB } from "../src/lib/local/db";

const USER_A = "00000000-0000-0000-0000-00000000000a";
const USER_B = "00000000-0000-0000-0000-00000000000b";

let db: PGlite;

async function asUser<T>(id: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(id ? `set role authenticated; set request.jwt.sub = '${id}';` : `set role anon; set request.jwt.sub = '';`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; set request.jwt.sub = '';`);
  }
}

async function newItem(user = USER_A, fields = `buy_price, status`, values = `100, 'in_stock'`) {
  const r = await db.query<{ id: string }>(
    `insert into public.items (user_id, brand, name, ${fields})
     values ('${user}', 'Brand', 'Thing', ${values}) returning id`,
  );
  return r.rows[0].id;
}

async function statusOf(id: string) {
  const r = await db.query<{ status: string }>(`select status from public.items where id = $1`, [id]);
  return r.rows[0]?.status;
}

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(dir).sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  await db.query(`insert into auth.users (id, email) values ($1, 'a@x.test'), ($2, 'b@x.test')`, [USER_A, USER_B]);
});

after(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`delete from public.items; delete from public.expenses;`);
});

test("new users get settings and default platforms", async () => {
  const s = await db.query(`select * from public.user_settings where user_id = $1`, [USER_A]);
  assert.equal(s.rows.length, 1);
  const p = await db.query(`select name from public.platforms where user_id = $1`, [USER_A]);
  assert.ok(p.rows.length >= 3);
});

test("net_profit is generated from the sale and the item's CHF cost", async () => {
  const id = await newItem();
  await db.query(`insert into public.sales (item_id, platform, sale_price, fees, shipping_cost) values ($1, 'Vinted', 250, 20, 10)`, [id]);
  const r = await db.query<{ net_profit: string }>(`select net_profit from public.sales where item_id = $1`, [id]);
  assert.equal(Number(r.rows[0].net_profit), 120);
});

test("net_profit follows a later correction of the item's cost", async () => {
  const id = await newItem();
  await db.query(`insert into public.sales (item_id, platform, sale_price) values ($1, 'Vinted', 250)`, [id]);
  await db.query(`update public.items set buy_price = 150 where id = $1`, [id]);
  const r = await db.query<{ net_profit: string }>(`select net_profit from public.sales where item_id = $1`, [id]);
  assert.equal(Number(r.rows[0].net_profit), 100);
});

test("non-CHF purchases keep the converted CHF price", async () => {
  const id = await newItem(USER_A, `buy_price, buy_currency, buy_price_chf`, `100, 'EUR', 94.5`);
  const r = await db.query<{ buy_price_chf: string }>(`select buy_price_chf from public.items where id = $1`, [id]);
  assert.equal(Number(r.rows[0].buy_price_chf), 94.5);
});

test("CHF purchases cannot drift from buy_price", async () => {
  const id = await newItem(USER_A, `buy_price, buy_currency, buy_price_chf`, `100, 'CHF', 999`);
  const r = await db.query<{ buy_price_chf: string }>(`select buy_price_chf from public.items where id = $1`, [id]);
  assert.equal(Number(r.rows[0].buy_price_chf), 100);
});

test("an item cannot be marked sold without a sale", async () => {
  await assert.rejects(newItem(USER_A, `status`, `'sold'`), /record a sale/);
  const id = await newItem();
  await assert.rejects(db.query(`update public.items set status = 'sold' where id = $1`, [id]), /recording a sale/);
});

test("a sale marks the item sold and closes its listings at the sale date", async () => {
  const id = await newItem();
  await db.query(`insert into public.listings (item_id, platform, list_price) values ($1, 'Vinted', 300)`, [id]);
  assert.equal(await statusOf(id), "listed");
  await db.query(`insert into public.sales (item_id, platform, sale_price, sold_at) values ($1, 'Vinted', 280, '2026-01-15')`, [id]);
  assert.equal(await statusOf(id), "sold");
  const l = await db.query<{ delisted_at: Date }>(`select delisted_at from public.listings where item_id = $1`, [id]);
  assert.equal(l.rows[0].delisted_at.toISOString().slice(0, 10), "2026-01-15");
});

test("a sold item's status is locked until the sale is deleted", async () => {
  const id = await newItem();
  await db.query(`insert into public.sales (item_id, platform, sale_price) values ($1, 'Vinted', 280)`, [id]);
  await assert.rejects(db.query(`update public.items set status = 'in_stock' where id = $1`, [id]), /Delete the sale/);
  await db.query(`delete from public.sales where item_id = $1`, [id]);
  assert.equal(await statusOf(id), "in_stock");
});

test("deleting a sold item cascades without error", async () => {
  const id = await newItem();
  await db.query(`insert into public.sales (item_id, platform, sale_price) values ($1, 'Vinted', 280)`, [id]);
  await db.query(`delete from public.items where id = $1`, [id]);
  const r = await db.query(`select 1 from public.sales where item_id = $1`, [id]);
  assert.equal(r.rows.length, 0);
});

test("setting status to listed opens a listing; leaving it closes the listing", async () => {
  const id = await newItem();
  await db.query(`update public.items set status = 'listed' where id = $1`, [id]);
  const open = await db.query(`select 1 from public.listings where item_id = $1 and delisted_at is null`, [id]);
  assert.equal(open.rows.length, 1);
  await db.query(`update public.items set status = 'personal' where id = $1`, [id]);
  const stillOpen = await db.query(`select 1 from public.listings where item_id = $1 and delisted_at is null`, [id]);
  assert.equal(stillOpen.rows.length, 0);
  assert.equal(await statusOf(id), "personal");
});

test("closing the last listing returns the item to stock; closing one of two does not", async () => {
  const id = await newItem();
  const a = await db.query<{ id: string }>(`insert into public.listings (item_id, platform) values ($1, 'A') returning id`, [id]);
  const b = await db.query<{ id: string }>(`insert into public.listings (item_id, platform) values ($1, 'B') returning id`, [id]);
  await db.query(`update public.listings set delisted_at = now() where id = $1`, [a.rows[0].id]);
  assert.equal(await statusOf(id), "listed");
  await db.query(`update public.listings set delisted_at = now() where id = $1`, [b.rows[0].id]);
  assert.equal(await statusOf(id), "in_stock");
});

test("listing a sold item is refused", async () => {
  const id = await newItem();
  await db.query(`insert into public.sales (item_id, platform, sale_price) values ($1, 'Vinted', 280)`, [id]);
  await assert.rejects(db.query(`insert into public.listings (item_id, platform) values ($1, 'B')`, [id]), /Delete the sale/);
});

test("changing a list price records a price change", async () => {
  const id = await newItem();
  const l = await db.query<{ id: string }>(`insert into public.listings (item_id, platform, list_price) values ($1, 'A', 300) returning id`, [id]);
  await db.query(`update public.listings set list_price = 270 where id = $1`, [l.rows[0].id]);
  await db.query(`update public.listings set platform = 'B' where id = $1`, [l.rows[0].id]);
  const r = await db.query<{ old_price: string; new_price: string }>(`select old_price, new_price from public.price_changes where listing_id = $1`, [l.rows[0].id]);
  assert.equal(r.rows.length, 1);
  assert.equal(Number(r.rows[0].old_price), 300);
  assert.equal(Number(r.rows[0].new_price), 270);
});

test("the same item can only be logged as worn once a day", async () => {
  const id = await newItem();
  await db.query(`insert into public.wears (item_id, worn_on) values ($1, '2026-01-01')`, [id]);
  await assert.rejects(db.query(`insert into public.wears (item_id, worn_on) values ($1, '2026-01-01')`, [id]));
});

test("RLS: users only see and change their own rows", async () => {
  const mine = await newItem(USER_A);
  const theirs = await newItem(USER_B);
  await asUser(USER_A, async () => {
    const r = await db.query<{ id: string }>(`select id from public.items`);
    assert.deepEqual(r.rows.map((x) => x.id), [mine]);
    const u = await db.query(`update public.items set name = 'hacked' where id = $1`, [theirs]);
    assert.equal(u.affectedRows, 0);
    const d = await db.query(`delete from public.items where id = $1`, [theirs]);
    assert.equal(d.affectedRows, 0);
    await assert.rejects(db.query(`insert into public.items (user_id, brand, name) values ($1, 'x', 'y')`, [USER_B]));
  });
  const r = await db.query<{ name: string }>(`select name from public.items where id = $1`, [theirs]);
  assert.equal(r.rows[0].name, "Thing");
});

test("RLS: child rows cannot be attached to someone else's item", async () => {
  const theirs = await newItem(USER_B);
  await asUser(USER_A, async () => {
    for (const sql of [
      `insert into public.sales (item_id, platform, sale_price) values ($1, 'x', 1)`,
      `insert into public.listings (item_id, platform) values ($1, 'x')`,
      `insert into public.wears (item_id) values ($1)`,
      `insert into public.item_images (item_id, url) values ($1, 'x')`,
      `insert into public.offers (item_id, amount_chf) values ($1, 1)`,
    ]) {
      await assert.rejects(db.query(sql, [theirs]), /row-level security/, sql);
    }
  });
});

test("RLS: an outfit cannot contain someone else's item", async () => {
  const theirs = await newItem(USER_B);
  await asUser(USER_A, async () => {
    const o = await db.query<{ id: string }>(`insert into public.outfits (name) values ('look') returning id`);
    await assert.rejects(db.query(`insert into public.outfit_items (outfit_id, item_id) values ($1, $2)`, [o.rows[0].id, theirs]));
  });
  await db.exec(`delete from public.outfits`);
});

test("RLS: triggers work for a normal signed-in user", async () => {
  await asUser(USER_A, async () => {
    const i = await db.query<{ id: string }>(`insert into public.items (brand, name, buy_price) values ('B', 'N', 50) returning id`);
    const id = i.rows[0].id;
    const l = await db.query<{ id: string }>(`insert into public.listings (item_id, platform, list_price) values ($1, 'V', 100) returning id`, [id]);
    await db.query(`update public.listings set list_price = 90 where id = $1`, [l.rows[0].id]);
    await db.query(`insert into public.sales (item_id, platform, sale_price) values ($1, 'V', 90)`, [id]);
    const r = await db.query<{ status: string }>(`select status from public.items where id = $1`, [id]);
    assert.equal(r.rows[0].status, "sold");
  });
});

test("RLS: anonymous users have no access at all", async () => {
  await newItem(USER_A);
  await asUser(null, async () => {
    await assert.rejects(db.query(`select * from public.items`), /permission denied/);
    await assert.rejects(db.query(`insert into public.items (brand, name) values ('x', 'y')`), /permission denied/);
  });
});
