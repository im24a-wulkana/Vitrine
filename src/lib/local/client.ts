// A small stand-in for the Supabase client, backed by the embedded Postgres in
// db.ts. It implements only the query-builder calls this app uses, and returns
// the same result shapes, so app code doesn't know which backend it's talking to.
import { rmSync } from "node:fs";
import { basename, join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { LOCAL_UPLOAD_DIR, LOCAL_USER_ID } from "./paths";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };

interface Relation {
  table: string;
  /** "many"/"one": the child holds the key. "parent": this row holds the key. */
  kind: "many" | "one" | "parent";
  key: string;
}

const RELATIONS: Record<string, Record<string, Relation>> = {
  items: {
    item_images: { table: "item_images", kind: "many", key: "item_id" },
    listings: { table: "listings", kind: "many", key: "item_id" },
    sales: { table: "sales", kind: "one", key: "item_id" },
    wears: { table: "wears", kind: "many", key: "item_id" },
    offers: { table: "offers", kind: "many", key: "item_id" },
    lots: { table: "lots", kind: "parent", key: "lot_id" },
  },
  lots: { items: { table: "items", kind: "many", key: "lot_id" } },
  offers: { platforms: { table: "platforms", kind: "parent", key: "platform_id" } },
  listings: {
    price_changes: { table: "price_changes", kind: "many", key: "listing_id" },
    items: { table: "items", kind: "parent", key: "item_id" },
  },
  sales: { items: { table: "items", kind: "parent", key: "item_id" } },
  outfits: { outfit_items: { table: "outfit_items", kind: "many", key: "outfit_id" } },
};

const PRIMARY_KEY: Record<string, string> = { user_settings: "user_id" };

function ident(name: string): string {
  if (!/^[a-z_]+$/.test(name)) throw new Error(`Unexpected identifier: ${name}`);
  return `"${name}"`;
}

interface Selection {
  star: boolean;
  columns: string[];
  embeds: { name: string; selection: Selection }[];
}

/** Parses PostgREST select syntax such as "*, listings(*, price_changes(*)), items!inner(brand)". */
function parseSelect(text: string): Selection {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const c of text) {
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  parts.push(current);

  const selection: Selection = { star: false, columns: [], embeds: [] };
  for (const raw of parts) {
    const part = raw.trim();
    if (part === "*") selection.star = true;
    else if (part.includes("(")) {
      const open = part.indexOf("(");
      selection.embeds.push({
        name: part.slice(0, open).split("!")[0].trim(),
        selection: parseSelect(part.slice(open + 1, part.lastIndexOf(")"))),
      });
    } else if (part) selection.columns.push(part);
  }
  return selection;
}

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private selection: Selection | null = null;
  private countOnly = false;
  private filters: { sql: (next: () => string) => string; values: unknown[] }[] = [];
  private orders: string[] = [];
  private max: number | null = null;
  private cardinality: "many" | "single" | "maybe" = "many";
  private rows: Row[] = [];
  private conflict: string | null = null;
  private ignoreDuplicates = false;

  constructor(private db: PGlite, private table: string) {
    ident(table);
  }

  select(columns = "*", options?: { count?: string; head?: boolean }) {
    this.selection = parseSelect(columns);
    if (options?.head) this.countOnly = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.rows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert";
    this.rows = Array.isArray(rows) ? rows : [rows];
    this.conflict = options?.onConflict ?? null;
    this.ignoreDuplicates = options?.ignoreDuplicates ?? false;
    return this;
  }
  update(values: Row) {
    this.op = "update";
    this.rows = [values];
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ sql: (next) => `${ident(column)} = ${next()}`, values: [value] });
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push({ sql: (next) => `${ident(column)} >= ${next()}`, values: [value] });
    return this;
  }
  lte(column: string, value: unknown) {
    this.filters.push({ sql: (next) => `${ident(column)} <= ${next()}`, values: [value] });
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push({ sql: (next) => `${ident(column)} <> ${next()}`, values: [value] });
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push({
      sql: (next) => (values.length ? `${ident(column)} in (${values.map(() => next()).join(", ")})` : "false"),
      values,
    });
    return this;
  }
  is(column: string, value: null) {
    if (value !== null) throw new Error("Only .is(column, null) is supported");
    this.filters.push({ sql: () => `${ident(column)} is null`, values: [] });
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push(`${ident(column)} ${options?.ascending === false ? "desc" : "asc"}`);
    return this;
  }
  limit(count: number) {
    this.max = count;
    return this;
  }
  single() {
    this.cardinality = "single";
    return this;
  }
  maybeSingle() {
    this.cardinality = "maybe";
    return this;
  }

  then<A = Result, B = never>(onOk?: ((value: Result) => A | PromiseLike<A>) | null, onErr?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return this.run().then(onOk, onErr);
  }

  private where(params: unknown[]): string {
    if (!this.filters.length) return "";
    const next = () => `$${params.length + 1}`;
    const clauses = this.filters.map((filter) => {
      let index = 0;
      return filter.sql(() => {
        const placeholder = next();
        params.push(filter.values[index++]);
        return placeholder;
      });
    });
    return ` where ${clauses.join(" and ")}`;
  }

  private async run(): Promise<Result> {
    try {
      let rows: Row[];
      if (this.op === "select") {
        const params: unknown[] = [];
        const where = this.where(params);
        if (this.countOnly) {
          const r = await this.db.query<{ n: number }>(`select count(*)::int as n from ${ident(this.table)}${where}`, params);
          return { data: null, error: null, count: r.rows[0].n };
        }
        const order = this.orders.length ? ` order by ${this.orders.join(", ")}` : "";
        const limit = this.max !== null ? ` limit ${Number(this.max)}` : "";
        rows = (await this.db.query<Row>(`select * from ${ident(this.table)}${where}${order}${limit}`, params)).rows;
      } else {
        rows = await this.mutate();
        // Like Supabase, a write returns no rows unless .select() was chained on.
        if (!this.selection) return { data: null, error: null };
      }

      const shaped = await shape(this.db, this.table, rows, this.selection ?? parseSelect("*"));
      if (this.cardinality === "many") return { data: shaped, error: null, count: null };
      if (shaped.length > 1) return { data: null, error: { message: "Expected one row", code: "PGRST116" } };
      if (shaped.length === 0 && this.cardinality === "single") {
        return { data: null, error: { message: "Expected one row, found none", code: "PGRST116" } };
      }
      return { data: shaped[0] ?? null, error: null };
    } catch (e) {
      const err = e as { message?: string; code?: string };
      return { data: null, error: { message: err.message ?? "Database error", code: err.code } };
    }
  }

  private async mutate(): Promise<Row[]> {
    const table = ident(this.table);
    const params: unknown[] = [];

    if (this.op === "delete") {
      const where = this.where(params);
      return (await this.db.query<Row>(`delete from ${table}${where} returning *`, params)).rows;
    }

    if (this.op === "update") {
      const entries = Object.entries(this.rows[0]).filter(([, v]) => v !== undefined);
      const sets = entries.map(([column, value]) => {
        params.push(value);
        return `${ident(column)} = $${params.length}`;
      });
      const where = this.where(params);
      return (await this.db.query<Row>(`update ${table} set ${sets.join(", ")}${where} returning *`, params)).rows;
    }

    if (this.rows.length === 0) return [];
    const columns = [...new Set(this.rows.flatMap((row) => Object.keys(row).filter((k) => row[k] !== undefined)))];
    const values = this.rows.map((row) => {
      const cells = columns.map((column) => {
        if (row[column] === undefined) return "default";
        params.push(row[column]);
        return `$${params.length}`;
      });
      return `(${cells.join(", ")})`;
    });

    let conflict = "";
    if (this.op === "upsert") {
      const keys = (this.conflict ?? PRIMARY_KEY[this.table] ?? "id").split(",").map((k) => k.trim());
      const updates = columns.filter((c) => !keys.includes(c)).map((c) => `${ident(c)} = excluded.${ident(c)}`);
      const target = `(${keys.map(ident).join(", ")})`;
      conflict = this.ignoreDuplicates || !updates.length
        ? ` on conflict ${target} do nothing`
        : ` on conflict ${target} do update set ${updates.join(", ")}`;
    }
    const sql = `insert into ${table} (${columns.map(ident).join(", ")}) values ${values.join(", ")}${conflict} returning *`;
    return (await this.db.query<Row>(sql, params)).rows;
  }
}

/** Loads embedded relations and keeps only the requested columns. */
async function shape(db: PGlite, table: string, rows: Row[], selection: Selection): Promise<Row[]> {
  const output: Row[] = rows.map((row) => {
    if (selection.star) return { ...row };
    return Object.fromEntries(selection.columns.map((column) => [column, row[column]]));
  });

  for (const embed of selection.embeds) {
    const relation = RELATIONS[table]?.[embed.name];
    if (!relation) throw new Error(`No known relation from ${table} to ${embed.name}`);

    const lookupColumn = relation.kind === "parent" ? relation.key : "id";
    const ids = [...new Set(rows.map((row) => row[lookupColumn]))];
    const matchColumn = relation.kind === "parent" ? "id" : relation.key;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    const children = ids.length
      ? (await db.query<Row>(`select * from ${ident(relation.table)} where ${ident(matchColumn)} in (${placeholders})`, ids)).rows
      : [];
    const shapedChildren = await shape(db, relation.table, children, embed.selection);

    const groups = new Map<unknown, Row[]>();
    children.forEach((child, i) => {
      const key = child[matchColumn];
      groups.set(key, [...(groups.get(key) ?? []), shapedChildren[i]]);
    });
    rows.forEach((row, i) => {
      const matches = groups.get(row[lookupColumn]) ?? [];
      output[i][embed.name] = relation.kind === "many" ? matches : (matches[0] ?? null);
    });
  }
  return output;
}

export function createLocalClient(db: PGlite) {
  const user = { id: LOCAL_USER_ID, email: "Local mode" };
  return {
    from: (table: string) => new Query(db, table),
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      signOut: async () => ({ error: null }),
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          for (const path of paths) rmSync(join(LOCAL_UPLOAD_DIR, basename(path)), { force: true });
          return { data: null, error: null };
        },
      }),
    },
  };
}
