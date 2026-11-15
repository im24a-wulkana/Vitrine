import type { SqlRunner } from "./client";

export interface SessionUser {
  id: string;
  email: string;
  /** The shared, read-only demo account. */
  demo?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Anyone who signs in gets an account. The first visit adds them to auth.users,
 * which also creates their settings and default platforms. `run` must be the owner
 * connection, because people can't read or write auth.users themselves.
 */
export async function ensureUser(run: SqlRunner, id: string | undefined | null, email: string | undefined | null): Promise<SessionUser | null> {
  if (!id || !UUID.test(id)) return null;
  const found = await run.query(`select id, email from auth.users where id = $1`, [id]);
  let row = found.rows[0] as { id: string; email: string | null } | undefined;
  if (!row) {
    // Two first requests can arrive together, so the second one changes nothing.
    await run.query(`insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing`, [id, email ?? null]);
    row = { id, email: email ?? null };
  }
  return { id: row.id, email: row.email ?? "" };
}
