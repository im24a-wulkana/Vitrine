// Runs the exact statements the Neon runner sends, against real Postgres with real
// row level security, connected as an owner like Neon's. This is the code that keeps
// accounts apart, so it's tested through the same client the app uses.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { ensureUser } from "../src/lib/db/accounts";
import { createDbClient, type SqlRunner } from "../src/lib/db/client";
import { BOOTSTRAP_SQL, grantRolesTo, migrate } from "../src/lib/db/migrate";
import { scopedStatements } from "../src/lib/db/neon";
import { LOCAL_PARSERS } from "../src/lib/db/parsers";
import { buildBackup } from "../src/lib/backup";
import { ownedPhotoPath, isPhotoName } from "../src/lib/storage";

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";

let db: PGlite;

/** The same transaction shape as the driver's sql.transaction(). */
function scoped(userId: string | null): SqlRunner {
  return {
    async query(text, params = []) {
      const statements = scopedStatements(userId, text, params);
      return db.transaction(async (tx) => {
        let last: { rows: Record<string, unknown>[] } = { rows: [] };
        for (const s of statements) last = (await tx.query(s.text, s.params)) as typeof last;
        return last;
      }) as Promise<{ rows: Record<string, unknown>[] }>;
    },
  };
}

before(async () => {
  db = new PGlite({ parsers: LOCAL_PARSERS });
  await db.exec(BOOTSTRAP_SQL);
  const user = await db.query<{ current_user: string }>("select current_user");
  await db.exec(grantRolesTo(user.rows[0].current_user));
  await migrate({ exec: (sql) => db.exec(sql), query: (sql, params) => db.query(sql, params) });
  await db.query(`insert into auth.users (id, email) values ($1, 'a@x.test'), ($2, 'b@x.test')`, [ALICE, BOB]);
});
after(() => db.close());

test("setup can run again without changing or breaking anything", async () => {
  await db.exec(BOOTSTRAP_SQL);
  const ran = await migrate({ exec: (sql) => db.exec(sql), query: (sql, params) => db.query(sql, params) });
  assert.deepEqual(ran, []);
  const { rows } = await db.query(`select id from auth.users`);
  assert.equal(rows.length, 2);
});

test("a failed migration rolls back, and reports which file failed", async () => {
  const seen: string[] = [];
  const failing = {
    exec: async (sql: string) => {
      seen.push(sql.slice(0, 8));
      if (sql.includes("VITRINE")) throw new Error("boom");
    },
    query: async <T>() => ({ rows: [] as T[] }),
  };
  await assert.rejects(migrate(failing), /Migration 0001_schema\.sql failed: boom/);
  assert.equal(seen.at(-1), "rollback");
});

test("each user sees only their own rows through the app's client", async () => {
  const alice = createDbClient(scoped(ALICE));
  const bob = createDbClient(scoped(BOB));
  assert.equal((await alice.from("items").insert({ user_id: ALICE, brand: "A", name: "Alice's coat", buy_price: 10 })).error, null);
  assert.equal((await bob.from("items").insert({ user_id: BOB, brand: "B", name: "Bob's coat", buy_price: 20 })).error, null);

  const names = async (client: typeof alice) => ((await client.from("items").select("name")).data as { name: string }[]).map((r) => r.name);
  assert.deepEqual(await names(alice), ["Alice's coat"]);
  assert.deepEqual(await names(bob), ["Bob's coat"]);
});

test("a user can't write as someone else, or change their rows", async () => {
  const alice = createDbClient(scoped(ALICE));
  const { error } = await alice.from("items").insert({ user_id: BOB, brand: "X", name: "Planted" });
  assert.match(error?.message ?? "", /row-level security/);

  const { rows } = await db.query<{ id: string }>(`select id from public.items where user_id = $1`, [BOB]);
  const { data: updated } = await alice.from("items").update({ name: "Hacked" }).eq("id", rows[0].id).select("id");
  assert.deepEqual(updated, []);
  const { data: deleted } = await alice.from("items").delete().eq("id", rows[0].id).select("id");
  assert.deepEqual(deleted, []);
  const check = await db.query<{ name: string }>(`select name from public.items where id = $1`, [rows[0].id]);
  assert.equal(check.rows[0].name, "Bob's coat");
});

test("embedded rows stay scoped too", async () => {
  const { rows } = await db.query<{ id: string }>(`select id from public.items where user_id = $1`, [BOB]);
  await db.query(`insert into public.listings (item_id, platform, list_price) values ($1, 'Grailed', 99)`, [rows[0].id]);
  const alice = createDbClient(scoped(ALICE));
  assert.deepEqual((await alice.from("listings").select("id")).data, []);
  const { data } = await alice.from("items").select("name, listings(platform)");
  assert.deepEqual(data, [{ name: "Alice's coat", listings: [] }]);
});

test("triggers work for a restricted user: sale, status, profit, wear log", async () => {
  const alice = createDbClient(scoped(ALICE));
  const { data } = await alice.from("items").insert({ user_id: ALICE, brand: "A", name: "Sold shirt", buy_price: 30 }).select("id").single();
  const id = (data as { id: string }).id;
  assert.equal((await alice.from("listings").insert({ item_id: id, platform: "Vinted", list_price: 90 })).error, null);
  assert.equal((await alice.from("sales").insert({ item_id: id, platform: "Vinted", sale_price: 80 })).error, null);
  const { data: sold } = await alice.from("items").select("status, sales(net_profit)").eq("id", id).single();
  assert.deepEqual(sold, { status: "sold", sales: { net_profit: 50 } });

  assert.equal((await alice.from("wear_logs").upsert({ user_id: ALICE, date: "2026-03-01", item_ids: [id] }, { onConflict: "user_id,date" })).error, null);
  assert.equal(((await alice.from("wears").select("id").eq("item_id", id)).data as unknown[]).length, 1);
});

test("with no user, nothing is reachable at all", async () => {
  const anon = createDbClient(scoped(null));
  for (const table of ["items", "sales", "wear_logs", "push_subscriptions", "user_settings"]) {
    const { error } = await anon.from(table).select("*");
    assert.match(error?.message ?? "", /permission denied/, table);
  }
  const { error } = await anon.from("items").insert({ brand: "X", name: "Y" });
  assert.match(error?.message ?? "", /permission denied/);
});

test("the role and user don't outlive the transaction", async () => {
  await createDbClient(scoped(ALICE)).from("items").select("id");
  const { rows } = await db.query<{ role: string; sub: string | null }>(`select current_user as role, current_setting('request.jwt.sub', true) as sub`);
  assert.notEqual(rows[0].role, "authenticated");
  assert.ok(!rows[0].sub, "user id must be cleared");
});

test("a backup through a user's client holds only that user's data", async () => {
  const backup = await buildBackup(createDbClient(scoped(BOB)));
  const text = JSON.stringify(backup);
  assert.ok(text.includes("Bob's coat"));
  assert.ok(!text.includes("Alice's coat"));
});

test("people can only reach photo files under their own id", () => {
  const name = "3f2a1b4c-0000-4000-8000-000000000001.jpg";
  assert.equal(ownedPhotoPath(ALICE, `/api/photos/${ALICE}/${name}`), `${ALICE}/${name}`);
  assert.equal(ownedPhotoPath(ALICE, `/api/photos/${BOB}/${name}`), null);
  assert.equal(ownedPhotoPath(ALICE, `/api/photos/${ALICE}/../${BOB}/${name}`), null);
  assert.equal(ownedPhotoPath(ALICE, "https://evil.test/x.jpg"), null);
  assert.equal(isPhotoName(name), true);
  for (const bad of ["../secret.jpg", "x.jpg", `${name}.exe`, "3f2a1b4c-0000-4000-8000-000000000001.svg"]) assert.equal(isPhotoName(bad), false, bad);
});

// The real driver, with only the network replaced, so nothing here needs a Neon project.
test("the driver sends the user's scope in one transaction and parses values like local mode", async () => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://owner:pw@ep-test.neon.tech/db";
  const bodies: { queries: { query: string; params: unknown[] }[] }[] = [];
  globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    const empty = { fields: [], rows: [], rowCount: 0, command: "SET", rowAsArray: true };
    const row = {
      fields: [
        { name: "price", dataTypeID: 1700 },
        { name: "day", dataTypeID: 1082 },
        { name: "at", dataTypeID: 1184 },
        { name: "tags", dataTypeID: 1009 },
        { name: "extra", dataTypeID: 3802 },
      ],
      rows: [["12.50", "2026-03-01", "2026-03-01 10:00:00+00", "{a,b}", '{"x":1}']],
      rowCount: 1,
      command: "SELECT",
      rowAsArray: true,
    };
    return new Response(JSON.stringify({ results: [empty, empty, row] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  try {
    const { userRunner } = await import("../src/lib/db/neon");
    const { rows } = await userRunner(ALICE).query("select * from public.items where tags = $1", [["a", "b"]]);
    assert.deepEqual(rows, [{ price: 12.5, day: "2026-03-01", at: "2026-03-01T10:00:00.000Z", tags: ["a", "b"], extra: { x: 1 } }]);

    assert.equal(bodies.length, 1, "one transaction, not three requests");
    const [setUser, setRole, statement] = bodies[0].queries;
    assert.match(setUser.query, /set_config\('request\.jwt\.sub'/);
    assert.deepEqual(setUser.params, [ALICE]);
    assert.equal(setRole.query, "set local role authenticated");
    assert.deepEqual(statement.params, ["{\"a\",\"b\"}"]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
});

test("the first sign-in creates a private account, and later ones change nothing", async () => {
  const owner: SqlRunner = { query: (text, params) => db.query(text, params) as ReturnType<SqlRunner["query"]> };
  const NEW = "00000000-0000-4000-8000-00000000000c";

  assert.deepEqual(await ensureUser(owner, NEW, "new@x.test"), { id: NEW, email: "new@x.test" });
  const fresh = createDbClient(scoped(NEW));
  assert.equal(((await fresh.from("user_settings").select("user_id")).data as unknown[]).length, 1, "gets settings");
  assert.ok(((await fresh.from("platforms").select("name")).data as unknown[]).length > 0, "gets default platforms");
  assert.deepEqual((await fresh.from("items").select("id")).data, [], "starts empty, sees no one else's items");

  assert.deepEqual(await ensureUser(owner, NEW, "changed@x.test"), { id: NEW, email: "new@x.test" });
  const { rows } = await db.query(`select id from auth.users where id = $1`, [NEW]);
  assert.equal(rows.length, 1);

  assert.equal(await ensureUser(owner, null, null), null, "no session");
  assert.equal(await ensureUser(owner, "not-a-uuid'; drop table auth.users; --", "x@x.test"), null, "bad id");
  await db.query(`delete from auth.users where id = $1`, [NEW]);
});

test("the demo's connection asks Neon for a read-only transaction", async () => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://owner:pw@ep-test.neon.tech/db";
  const seen: Record<string, string>[] = [];
  globalThis.fetch = (async (_url: unknown, init: { headers: Record<string, string> }) => {
    seen.push(Object.fromEntries(Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), String(v)])));
    const empty = { fields: [], rows: [], rowCount: 0, command: "SET", rowAsArray: true };
    return new Response(JSON.stringify({ results: [empty, empty, empty] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  try {
    const { userRunner } = await import("../src/lib/db/neon");
    await userRunner(ALICE, { readOnly: true }).query("select 1");
    await userRunner(ALICE).query("select 1");
    assert.equal(seen[0]["neon-batch-read-only"], "true");
    assert.notEqual(seen[1]["neon-batch-read-only"], "true");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
});

test("a refused write in the demo explains itself", async () => {
  const readOnly: SqlRunner = { query: async () => { throw Object.assign(new Error("cannot execute INSERT in a read-only transaction"), { code: "25006" }); } };
  const { error } = await createDbClient(readOnly).from("items").insert({ brand: "x", name: "y" });
  assert.match(error?.message ?? "", /This is the demo/);
});
