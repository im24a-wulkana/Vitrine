import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { SqlRunner } from "../db/client";
import { BOOTSTRAP_SQL, migrate } from "../db/migrate";
import { LOCAL_PARSERS } from "../db/parsers";
import { LOCAL_DATA_DIR, LOCAL_USER_ID } from "./paths";

/** Local mode has one person and no sign-in, so queries run directly. */
export function localRunner(db: PGlite): SqlRunner {
  return { query: (text, params) => db.query(text, params) as ReturnType<SqlRunner["query"]> };
}

async function open(): Promise<{ db: PGlite; created: boolean }> {
  if (process.env.VERCEL) {
    throw new Error("Local mode can't run on Vercel. Set DATABASE_URL, NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET.");
  }
  mkdirSync(LOCAL_DATA_DIR, { recursive: true });
  const dataDir = join(LOCAL_DATA_DIR, "db");
  const created = !existsSync(join(dataDir, "PG_VERSION"));

  const db = new PGlite(dataDir, { parsers: LOCAL_PARSERS });
  await db.waitReady;
  if (created) await db.exec(BOOTSTRAP_SQL);
  await migrate({ exec: (sql) => db.exec(sql), query: (sql, params) => db.query(sql, params) });
  // auth.uid() reads this, so column defaults and triggers see the local user.
  await db.exec(`set request.jwt.sub = '${LOCAL_USER_ID}'`);
  if (created) {
    await db.query(`insert into auth.users (id, email) values ($1, 'local') on conflict do nothing`, [LOCAL_USER_ID]);
  }
  return { db, created };
}

declare global {
  // Kept on globalThis so hot reloads in development reuse the one open database.
  var __vitrineLocalDb: Promise<PGlite> | undefined;
}

export function getLocalDb(): Promise<PGlite> {
  globalThis.__vitrineLocalDb ??= (async () => {
    const { db, created } = await open();
    if (created) {
      // First run: start with sample data so there is something to look at.
      const [{ createDbClient }, { seedSampleData }] = await Promise.all([import("../db/client"), import("../seed-data")]);
      await seedSampleData(createDbClient(localRunner(db)), LOCAL_USER_ID);
    }
    return db;
  })();
  return globalThis.__vitrineLocalDb;
}
