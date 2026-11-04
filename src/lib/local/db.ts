import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { LOCAL_DATA_DIR, LOCAL_USER_ID } from "./paths";

export { LOCAL_USER_ID };

/** The parts of Supabase's auth and storage schemas that the migrations rely on. */
export const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create schema storage;
  grant usage on schema auth, storage, public to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select string_to_array(name, '/') $$;
  grant all on storage.objects to authenticated;
`;

/** Returns values in the same shapes Supabase's API does: numbers and strings, not Date objects. */
export const LOCAL_PARSERS = {
  1700: (v: string) => parseFloat(v), // numeric
  1082: (v: string) => v, // date
  1184: (v: string) => new Date(v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString(), // timestamptz
};

/** Applies migrations that haven't run yet, so future migrations reach existing local data. */
export async function migrate(db: PGlite): Promise<void> {
  await db.exec(`create table if not exists public.local_migrations (name text primary key)`);
  const { rows } = await db.query<{ name: string }>(`select name from public.local_migrations`);
  const applied = new Set(rows.map((r) => r.name));
  const dir = join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(dir).sort()) {
    if (applied.has(file)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(readFileSync(join(dir, file), "utf8"));
      await tx.query(`insert into public.local_migrations (name) values ($1)`, [file]);
    });
  }
}

async function open(): Promise<{ db: PGlite; created: boolean }> {
  if (process.env.VERCEL) {
    throw new Error("Local mode can't run on Vercel. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  mkdirSync(LOCAL_DATA_DIR, { recursive: true });
  const dataDir = join(LOCAL_DATA_DIR, "db");
  const created = !existsSync(join(dataDir, "PG_VERSION"));

  const db = new PGlite(dataDir, { parsers: LOCAL_PARSERS });
  await db.waitReady;
  if (created) await db.exec(SUPABASE_STUB);
  await migrate(db);
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
      const [{ createLocalClient }, { seedSampleData }] = await Promise.all([import("./client"), import("../seed-data")]);
      await seedSampleData(createLocalClient(db), LOCAL_USER_ID);
    }
    return db;
  })();
  return globalThis.__vitrineLocalDb;
}
