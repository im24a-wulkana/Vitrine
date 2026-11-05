import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

/**
 * The auth and storage objects the migrations expect. They run first, and are safe
 * to run again. Accounts themselves live in Neon Auth: auth.users is this app's own
 * list of who is allowed in, and the id its data hangs off.
 */
export const BOOTSTRAP_SQL = `
  do $$ begin
    if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  end $$;
  create schema if not exists auth;
  create schema if not exists storage;
  grant usage on schema auth, storage, public to anon, authenticated, service_role;
  create table if not exists auth.users (id uuid primary key, email text);
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
  create table if not exists storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(name text) returns text[] language sql immutable as
    $$ select string_to_array(name, '/') $$;
  grant all on storage.objects to authenticated;
`;

/** Lets the connecting role switch to the restricted roles. Superusers don't need it, so it's separate. */
export function grantRolesTo(role: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(role)) throw new Error(`Unexpected role name: ${role}`);
  return `grant anon, authenticated to "${role}" with set true;`;
}

export interface MigrationTarget {
  exec(sql: string): Promise<unknown>;
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/** Applies migrations that haven't run yet, each in its own transaction. Returns the names it applied. */
export async function migrate(db: MigrationTarget): Promise<string[]> {
  await db.exec(`create table if not exists public.local_migrations (name text primary key)`);
  const { rows } = await db.query<{ name: string }>(`select name from public.local_migrations`);
  const applied = new Set(rows.map((r) => r.name));
  const ran: string[] = [];
  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    if (applied.has(file)) continue;
    await db.exec("begin");
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
      await db.query(`insert into public.local_migrations (name) values ($1)`, [file]);
      await db.exec("commit");
    } catch (error) {
      await db.exec("rollback");
      throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : error}`);
    }
    ran.push(file);
  }
  return ran;
}
