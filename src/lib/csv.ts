import { ITEM_STATUSES, type ItemStatus } from "./types";

// ---------------------------------------------------------------------------
// Parsing and writing
// ---------------------------------------------------------------------------

/** Parses quoted fields, embedded newlines, a BOM, and , ; or tab delimiters. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(input);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"' && field === "") {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const scores = [",", ";", "\t"].map((d) => ({ d, n: firstLine.split(d).length }));
  return scores.sort((a, b) => b.n - a.n)[0].d;
}

/**
 * A text cell beginning with = + - or @ would run as a formula in Excel, so it
 * is prefixed with an apostrophe. Numbers are passed through untouched.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: unknown[][]): string {
  return `﻿${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

// ---------------------------------------------------------------------------
// Value parsing
// ---------------------------------------------------------------------------

/** Accepts 1200.50, 1'200.50, 1’200.50, 1,200.50, 1.200,50, 1200,50 and "CHF 80". */
export function parseAmount(raw: string): number | null {
  let s = raw.trim().replace(/[^\d.,'’-]/g, "").replace(/['’]/g, "");
  if (s === "" || s === "-") return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Accepts YYYY-MM-DD, DD.MM.YYYY and DD/MM/YYYY. Returns null for impossible dates. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let y: string, m: string, d: string;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const eu = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (iso) [, y, m, d] = iso;
  else if (eu) [, d, m, y] = eu;
  else return null;

  const value = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function parseStatus(raw: string): ItemStatus | null {
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((ITEM_STATUSES as readonly string[]).includes(s)) return s as ItemStatus;
  const aliases: Record<string, ItemStatus> = { stock: "in_stock", instock: "in_stock", keep: "personal", active: "listed", for_sale: "listed" };
  return aliases[s] ?? null;
}

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

export const IMPORT_FIELDS = [
  { key: "brand", label: "Brand", required: true, hints: ["brand", "designer", "marke", "label"] },
  { key: "name", label: "Name", required: true, hints: ["name", "item", "title", "product", "description", "artikel"] },
  { key: "category", label: "Category", hints: ["category", "type", "kategorie"] },
  { key: "size", label: "Size", hints: ["size", "grösse", "groesse"] },
  { key: "color", label: "Color", hints: ["color", "colour", "farbe"] },
  { key: "condition", label: "Condition (1–10)", hints: ["condition", "zustand"] },
  { key: "status", label: "Status", hints: ["status", "state"] },
  { key: "buy_price", label: "Buy price", hints: ["buy_price", "buy price", "purchase price", "cost", "paid", "einkauf"] },
  { key: "buy_currency", label: "Buy currency", hints: ["buy_currency", "currency", "währung"] },
  { key: "buy_price_chf", label: "Buy price in CHF", hints: ["buy_price_chf", "price chf", "cost chf"] },
  { key: "buy_date", label: "Buy date", hints: ["buy_date", "buy date", "purchase date", "bought", "date"] },
  { key: "buy_source", label: "Bought from", hints: ["buy_source", "source", "bought from", "seller"] },
  { key: "notes", label: "Notes", hints: ["notes", "note", "comment", "notizen"] },
  { key: "tags", label: "Tags", hints: ["tags", "tag"] },
  { key: "platform", label: "Platform (listing or sale)", hints: ["platform", "marketplace", "sold on", "plattform"] },
  { key: "list_price", label: "List price", hints: ["list_price", "list price", "asking"] },
  { key: "sale_price", label: "Sale price", hints: ["sale_price", "sale price", "sold for", "sold price", "verkauf"] },
  { key: "fees", label: "Fees", hints: ["fees", "fee", "gebühr"] },
  { key: "shipping_cost", label: "Shipping cost", hints: ["shipping_cost", "shipping", "versand"] },
  { key: "sold_at", label: "Sold date", hints: ["sold_at", "sold date", "sale date", "date sold"] },
] as const satisfies readonly { key: string; label: string; required?: boolean; hints: readonly string[] }[];

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];
export type ColumnMapping = Partial<Record<ImportFieldKey, number>>;

/** Exact header matches win over partial ones, and each column is used once. */
export function guessMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const mapping: ColumnMapping = {};
  const used = new Set<number>();

  const claim = (match: (header: string, hint: string) => boolean) => {
    for (const field of IMPORT_FIELDS) {
      if (mapping[field.key] !== undefined) continue;
      for (const hint of field.hints) {
        const index = normalized.findIndex((h, i) => !used.has(i) && match(h, hint));
        if (index !== -1) {
          mapping[field.key] = index;
          used.add(index);
          break;
        }
      }
    }
  };
  claim((h, hint) => h === hint);
  claim((h, hint) => h.includes(hint));
  return mapping;
}

export interface ImportRow {
  brand: string;
  name: string;
  category: string | null;
  size: string | null;
  color: string | null;
  condition: number | null;
  status: ItemStatus;
  buy_price: number;
  buy_currency: string;
  buy_price_chf: number;
  buy_date: string | null;
  buy_source: string | null;
  notes: string | null;
  tags: string[];
  listing: { platform: string; list_price: number | null } | null;
  sale: { platform: string; sale_price: number; fees: number; shipping_cost: number; sold_at: string } | null;
}

export type MappedRow = { ok: true; row: ImportRow } | { ok: false; errors: string[] };

/**
 * Turns one CSV row into a validated row. Anything that would silently corrupt
 * profit figures is an error rather than a guess: for example a foreign price
 * with no CHF value, or a sold item with no sale price.
 */
export function mapRow(cells: string[], mapping: ColumnMapping, today: string): MappedRow {
  const get = (key: ImportFieldKey) => {
    const index = mapping[key];
    return index === undefined ? "" : (cells[index] ?? "").trim();
  };
  const errors: string[] = [];

  const amount = (key: ImportFieldKey, label: string): number | null => {
    const raw = get(key);
    if (raw === "") return null;
    const value = parseAmount(raw);
    if (value === null || value < 0) errors.push(`${label} "${raw}" is not a valid amount`);
    return value;
  };
  const date = (key: ImportFieldKey, label: string): string | null => {
    const raw = get(key);
    if (raw === "") return null;
    const value = parseDate(raw);
    if (!value) errors.push(`${label} "${raw}" is not a valid date`);
    return value;
  };

  const brand = get("brand");
  const name = get("name");
  if (!brand) errors.push("Brand is missing");
  if (!name) errors.push("Name is missing");

  const buyPrice = amount("buy_price", "Buy price");
  const buyChf = amount("buy_price_chf", "Buy price in CHF");
  const currency = (get("buy_currency") || "CHF").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) errors.push(`Currency "${get("buy_currency")}" is not a 3-letter code`);

  let chf = currency === "CHF" ? (buyPrice ?? buyChf ?? 0) : buyChf;
  if (chf === null) {
    errors.push(`A ${currency} price needs a CHF value`);
    chf = 0;
  }

  const salePrice = amount("sale_price", "Sale price");
  const listPrice = amount("list_price", "List price");
  const fees = amount("fees", "Fees");
  const shipping = amount("shipping_cost", "Shipping");
  const soldAt = date("sold_at", "Sold date");
  const buyDate = date("buy_date", "Buy date");
  const platform = get("platform");

  const rawStatus = get("status");
  let status = rawStatus ? parseStatus(rawStatus) : null;
  if (rawStatus && !status) errors.push(`Status "${rawStatus}" is not recognised`);
  if (!status) status = salePrice !== null ? "sold" : platform || listPrice !== null ? "listed" : "in_stock";

  let sale: ImportRow["sale"] = null;
  let listing: ImportRow["listing"] = null;
  if (status === "sold") {
    if (salePrice === null) errors.push("A sold item needs a sale price");
    sale = {
      platform: platform || "Other",
      sale_price: salePrice ?? 0,
      fees: fees ?? 0,
      shipping_cost: shipping ?? 0,
      sold_at: soldAt ?? today,
    };
  } else if (status === "listed") {
    listing = { platform: platform || "Unspecified", list_price: listPrice };
  }

  let condition: number | null = null;
  if (get("condition")) {
    condition = Number(get("condition"));
    if (!Number.isInteger(condition) || condition < 1 || condition > 10) {
      errors.push(`Condition "${get("condition")}" must be a whole number from 1 to 10`);
    }
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    row: {
      brand,
      name,
      category: get("category") || null,
      size: get("size") || null,
      color: get("color") || null,
      condition,
      status,
      buy_price: currency === "CHF" ? chf : (buyPrice ?? 0),
      buy_currency: currency,
      buy_price_chf: chf,
      buy_date: buyDate,
      buy_source: get("buy_source") || null,
      notes: get("notes") || null,
      tags: get("tags").split(/[,;|]/).map((t) => t.trim()).filter(Boolean),
      listing,
      sale,
    },
  };
}
