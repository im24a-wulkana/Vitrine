// Server only. The connection is Neon's owner role, which bypasses row level
// security, so every request from a person runs as a restricted role instead.
import { neon, types as pgTypes, type NeonQueryFunction } from "@neondatabase/serverless";
import type { SqlRunner } from "./client";
import { LOCAL_PARSERS } from "./parsers";

const parsers: Record<number, (value: string) => unknown> = LOCAL_PARSERS;

// The driver reads these per query, not from the connection. Same value shapes
// as local mode: numbers and strings, not Date objects.
const options = {
  types: {
    getTypeParser: ((oid: number, format?: "text" | "binary") => parsers[oid] ?? pgTypes.getTypeParser(oid, format as "text")) as typeof pgTypes.getTypeParser,
  },
};

let cached: NeonQueryFunction<false, false> | null = null;

function connection() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  cached ??= neon(url);
  return cached;
}

export interface Statement {
  text: string;
  params: unknown[];
}

/**
 * The statements for one query as a signed-in user, in order, inside one
 * transaction. The settings are `local`, so they end with the transaction and
 * can't leak into another request on a pooled connection.
 *
 * With no user, the query runs as `anon`, which has no access to any table.
 */
export function scopedStatements(userId: string | null, text: string, params: unknown[]): Statement[] {
  return [
    { text: "select set_config('request.jwt.sub', $1, true)", params: [userId ?? ""] },
    { text: `set local role ${userId ? "authenticated" : "anon"}`, params: [] },
    { text, params },
  ];
}

/** Row level security applies to everything this runs. Read-only refuses any write, in the database itself. */
export function userRunner(userId: string | null, mode: { readOnly?: boolean } = {}): SqlRunner {
  return {
    async query(text, params = []) {
      const sql = connection();
      const statements = scopedStatements(userId, text, params);
      const results = await sql.transaction(
        statements.map((s) => sql.query(s.text, s.params, options)),
        mode.readOnly ? { readOnly: true } : undefined,
      );
      return { rows: results[results.length - 1] as Record<string, unknown>[] };
    },
  };
}

/**
 * Bypasses row level security. Only for creating accounts on first sign-in, the scheduled
 * notification job and setup scripts, which must filter by user id themselves.
 */
export function ownerRunner(): SqlRunner {
  return {
    async query(text, params = []) {
      return { rows: (await connection().query(text, params, options)) as Record<string, unknown>[] };
    },
  };
}
