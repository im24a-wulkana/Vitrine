import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import webpush from "web-push";
import { buildBackup } from "../src/lib/backup";
import { categoryBreakdown, colorBreakdown, leastWorn, mostWorn, notWornIn6Months, type InsightItem } from "../src/lib/insights";
import { createDbClient } from "../src/lib/db/client";
import { BOOTSTRAP_SQL, migrate } from "../src/lib/db/migrate";
import { LOCAL_PARSERS } from "../src/lib/db/parsers";
import { localRunner } from "../src/lib/local/db";
import { LOCAL_USER_ID } from "../src/lib/local/paths";
import { dueMessages, isoWeek, isPushEndpoint, loadPushState, runPushCheck, type PushResult, type PushSender } from "../src/lib/push/check";

const TODAY = "2026-11-04";
const OTHER_USER = "00000000-0000-4000-8000-0000000000bb";

function piece(id: string, fields: Partial<InsightItem> = {}, wears: string[] = []): InsightItem {
  return {
    id, brand: "B", name: id, category: "Tops", color: null, colors: [], buy_price_chf: 100, buy_date: "2020-01-01", created_at: "2020-01-01T00:00:00Z",
    wears: wears.map((worn_on) => ({ worn_on })), ...fields,
  };
}

test("most worn skips unworn pieces; least worn includes them first", () => {
  const items = [piece("a", {}, ["2026-10-01", "2026-10-02"]), piece("b", {}, ["2026-10-03"]), piece("c")];
  assert.deepEqual(mostWorn(items).map((r) => r.item.id), ["a", "b"]);
  assert.deepEqual(leastWorn(items).map((r) => r.item.id), ["c", "b", "a"]);
  assert.equal(mostWorn(items)[0].costPerWear, 50);
  assert.equal(leastWorn(items)[0].costPerWear, null);
});

test("not worn in 6 months uses the last wear, or the purchase date if never worn", () => {
  const items = [piece("old", {}, ["2026-01-01"]), piece("recent", {}, ["2026-10-01"]), piece("never"), piece("new", { buy_date: "2026-10-30" })];
  assert.deepEqual(notWornIn6Months(items, TODAY).map((r) => r.item.id).sort(), ["never", "old"]);
});

test("breakdowns count each piece once, and shares add up to 100%", () => {
  const items = [
    piece("a", { category: "Tops", colors: ["Navy", "White"] }),
    piece("b", { category: "Knitwear", color: "Navy" }),
    piece("c", { category: null }),
    piece("d", { category: "Shoes", colors: ["Black"] }),
  ];
  const categories = categoryBreakdown(items);
  assert.deepEqual(categories.map((c) => [c.name, c.count]), [["Tops", 2], ["Other", 1], ["Shoes", 1]]);
  const colors = colorBreakdown(items);
  assert.deepEqual(colors.map((c) => [c.name, c.count]), [["Navy", 2], ["Black", 1], ["Unknown", 1]]);
  assert.equal(colors.reduce((sum, c) => sum + c.share, 0), 1);
});

test("iso weeks, including across a year boundary", () => {
  assert.equal(isoWeek("2026-11-04"), "2026-W45");
  assert.equal(isoWeek("2026-01-01"), "2026-W01");
  assert.equal(isoWeek("2027-01-01"), "2026-W53");
});

test("due messages follow the state, with keys that limit how often each repeats", () => {
  assert.deepEqual(dueMessages({ today: TODAY, agingCount: 0, toShipCount: 0, monthNet: 10, goal: 500 }), []);
  const all = dueMessages({ today: TODAY, agingCount: 2, toShipCount: 1, monthNet: 500, goal: 500 });
  assert.deepEqual(all.map((m) => m.key), ["aging:2026-W45", `to-ship:${TODAY}`, "goal:2026-11"]);
  assert.match(all[1].body, /1 sale needs/);
  assert.deepEqual(dueMessages({ today: TODAY, agingCount: 0, toShipCount: 0, monthNet: 900, goal: null }), []);
  assert.deepEqual(dueMessages({ today: TODAY, agingCount: 0, toShipCount: 0, monthNet: 0, goal: 0 }), []);
});

test("only real browser push services are accepted as endpoints", () => {
  for (const good of ["https://fcm.googleapis.com/fcm/send/x", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://wns2-par02p.notify.windows.com/w/x", "https://web.push.apple.com/x"]) {
    assert.equal(isPushEndpoint(good), true, good);
  }
  for (const bad of ["http://fcm.googleapis.com/x", "https://localhost/x", "https://169.254.169.254/latest", "https://fcm.googleapis.com.evil.test/x", "https://evil.test/notify.windows.com", "nonsense"]) {
    assert.equal(isPushEndpoint(bad), false, bad);
  }
});

test("web-push accepts generated keys and builds an encrypted request", () => {
  const vapid = webpush.generateVAPIDKeys();
  const client = { publicKey: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
  const details = webpush.generateRequestDetails(
    { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: client.publicKey, auth: client.auth } },
    JSON.stringify({ title: "Hello" }),
    { vapidDetails: { subject: "https://example.com", publicKey: vapid.publicKey, privateKey: vapid.privateKey } },
  );
  assert.equal(details.method, "POST");
  assert.equal(details.headers["Content-Encoding"], "aes128gcm");
  assert.match(String(details.headers.Authorization), /^vapid t=/);
  assert.ok(!(details.body as Buffer).toString("latin1").includes("Hello"));
});

let db: PGlite;
let client: ReturnType<typeof createDbClient>;

before(async () => {
  db = new PGlite({ parsers: LOCAL_PARSERS });
  await db.exec(BOOTSTRAP_SQL);
  await migrate({ exec: (sql) => db.exec(sql), query: (sql, params) => db.query(sql, params) });
  await db.exec(`set request.jwt.sub = '${LOCAL_USER_ID}'`);
  await db.query(`insert into auth.users (id, email) values ($1, 'me'), ($2, 'other')`, [LOCAL_USER_ID, OTHER_USER]);
  client = createDbClient(localRunner(db));
});
after(() => db.close());
beforeEach(async () => {
  await db.exec(`delete from public.push_log; delete from public.push_subscriptions; delete from public.items; delete from public.expenses;`);
  await db.query(`update public.user_settings set monthly_profit_goal_chf = null, aging_threshold_days = 30`);
});

async function addSale(user: string, salePrice: number, soldAt = TODAY) {
  const r = await db.query<{ id: string }>(`insert into public.items (user_id, brand, name, buy_price) values ($1, 'B', 'N', 0) returning id`, [user]);
  await db.query(`insert into public.sales (item_id, platform, sale_price, sold_at) values ($1, 'V', $2, $3)`, [r.rows[0].id, salePrice, soldAt]);
}
const subscribe = (user: string, endpoint: string) =>
  db.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'p', 'a')`, [user, endpoint]);

test("push state only counts the given user, even when the client can see everyone", async () => {
  await addSale(LOCAL_USER_ID, 100);
  await addSale(OTHER_USER, 9999);
  await db.query(`insert into public.expenses (user_id, category, amount_chf, date) values ($1, 'x', 30, $2), ($3, 'x', 5000, $2)`, [LOCAL_USER_ID, TODAY, OTHER_USER]);
  await db.query(`update public.user_settings set monthly_profit_goal_chf = 50 where user_id = $1`, [LOCAL_USER_ID]);
  const state = await loadPushState(client, LOCAL_USER_ID, TODAY);
  assert.equal(state.toShipCount, 1);
  assert.equal(state.monthNet, 70);
  assert.equal(state.goal, 50);
});

test("aging counts open listings past the threshold, and a markdown restarts the clock", async () => {
  const r = await db.query<{ id: string }>(`insert into public.items (user_id, brand, name) values ($1, 'B', 'N') returning id`, [LOCAL_USER_ID]);
  await db.query(`insert into public.listings (item_id, platform, list_price, listed_at) values ($1, 'V', 100, '2026-09-01')`, [r.rows[0].id]);
  assert.equal((await loadPushState(client, LOCAL_USER_ID, TODAY)).agingCount, 1);
  await db.query(`update public.listings set list_price = 90 where item_id = $1`, [r.rows[0].id]);
  assert.equal((await loadPushState(client, LOCAL_USER_ID, new Date().toISOString().slice(0, 10))).agingCount, 0);
});

function recorder(result: (endpoint: string) => PushResult = () => "sent") {
  const calls: [string, string][] = [];
  const send: PushSender = async (sub, message) => {
    calls.push([sub.endpoint, message.key]);
    return result(sub.endpoint);
  };
  return { calls, send };
}

test("messages go to every device of that user only, and never twice", async () => {
  await addSale(LOCAL_USER_ID, 100);
  await addSale(OTHER_USER, 100);
  await subscribe(LOCAL_USER_ID, "https://e/1");
  await subscribe(LOCAL_USER_ID, "https://e/2");
  await subscribe(OTHER_USER, "https://e/other");
  const { calls, send } = recorder();

  assert.equal((await runPushCheck(client, LOCAL_USER_ID, TODAY, send)).sent, 1);
  assert.deepEqual(calls.map((c) => c[0]).sort(), ["https://e/1", "https://e/2"]);
  assert.equal((await runPushCheck(client, LOCAL_USER_ID, TODAY, send)).sent, 0);
  assert.equal(calls.length, 2);
  // The same sale nags again on a new day.
  assert.equal((await runPushCheck(client, LOCAL_USER_ID, "2026-11-05", send)).sent, 1);
});

test("a failed send is retried next time, and dead devices are removed", async () => {
  await addSale(LOCAL_USER_ID, 100);
  await subscribe(LOCAL_USER_ID, "https://e/dead");
  await subscribe(LOCAL_USER_ID, "https://e/flaky");

  const first = recorder((endpoint) => (endpoint.endsWith("dead") ? "gone" : "failed"));
  assert.deepEqual(await runPushCheck(client, LOCAL_USER_ID, TODAY, first.send), { sent: 0, removed: 1 });
  const left = await db.query<{ endpoint: string }>(`select endpoint from public.push_subscriptions`);
  assert.deepEqual(left.rows.map((r) => r.endpoint), ["https://e/flaky"]);

  const second = recorder();
  assert.equal((await runPushCheck(client, LOCAL_USER_ID, TODAY, second.send)).sent, 1);
});

test("the local client saves a device the way the app does, and rejects unsafe column names", async () => {
  // p256dh has digits in it, which the local client once refused.
  const row = { user_id: LOCAL_USER_ID, endpoint: "https://e/real", p256dh: "key", auth: "secret" };
  assert.equal((await client.from("push_subscriptions").upsert(row, { onConflict: "endpoint" })).error, null);
  assert.equal((await client.from("push_subscriptions").upsert({ ...row, p256dh: "newer" }, { onConflict: "endpoint" })).error, null);
  const { data } = await client.from("push_subscriptions").select("endpoint, p256dh");
  assert.deepEqual(data, [{ endpoint: "https://e/real", p256dh: "newer" }]);
  const bad = await client.from("items").insert({ brand: "B", name: "N", 'x" = 1; drop table items; --': 1 });
  assert.match(bad.error?.message ?? "", /Unexpected identifier/);
});

test("no devices means no work and nothing logged", async () => {
  await addSale(LOCAL_USER_ID, 100);
  const { calls, send } = recorder();
  assert.deepEqual(await runPushCheck(client, LOCAL_USER_ID, TODAY, send), { sent: 0, removed: 0 });
  assert.equal(calls.length, 0);
  assert.equal((await db.query(`select 1 from public.push_log`)).rows.length, 0);
});

test("the backup holds every table, and leaves out push subscriptions", async () => {
  await addSale(LOCAL_USER_ID, 100);
  await subscribe(LOCAL_USER_ID, "https://e/secret");
  const backup = await buildBackup(client, new Date("2026-11-04T10:00:00Z"));
  assert.equal(backup.version, 1);
  assert.equal(backup.exported_at, "2026-11-04T10:00:00.000Z");
  assert.equal(backup.tables.items.length, 1);
  assert.equal(backup.tables.sales.length, 1);
  assert.ok("wear_logs" in backup.tables && "lots" in backup.tables && "offers" in backup.tables);
  assert.ok(!JSON.stringify(backup).includes("https://e/secret"));
  const roundTrip = JSON.parse(JSON.stringify(backup));
  assert.equal(roundTrip.tables.sales[0].net_profit, 100);
});

test("the backup fails loudly rather than returning part of the data", async () => {
  const broken = { from: () => ({ select: async () => ({ data: null, error: { message: "boom" } }) }) };
  await assert.rejects(buildBackup(broken), /Couldn't read user_settings: boom/);
});

test("RLS: push subscriptions and logs are private", async () => {
  await subscribe(OTHER_USER, "https://e/theirs");
  await db.exec(`set role authenticated`);
  try {
    assert.equal((await db.query(`select 1 from public.push_subscriptions`)).rows.length, 0);
    await assert.rejects(db.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://x', 'p', 'a')`, [OTHER_USER]));
    await assert.rejects(db.query(`insert into public.push_log (user_id, key) values ($1, 'k')`, [OTHER_USER]));
  } finally {
    await db.exec(`reset role`);
  }
});
