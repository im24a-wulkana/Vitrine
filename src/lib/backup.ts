// Backup of everything in the account, as one JSON document. Push subscriptions
// are left out: they belong to a device, and hold keys with no use elsewhere.

const TABLES = [
  "user_settings",
  "platforms",
  "lots",
  "items",
  "item_images",
  "listings",
  "price_changes",
  "offers",
  "sales",
  "expenses",
  "outfits",
  "outfit_items",
  "wear_logs",
  "wears",
  "wishlist",
] as const;

type Client = { from: (table: string) => { select: (columns: string) => PromiseLike<{ data: unknown; error: { message: string } | null }> } };

export interface Backup {
  app: "vitrine";
  version: 1;
  exported_at: string;
  note: string;
  tables: Record<(typeof TABLES)[number], unknown[]>;
}

/** Row level security limits this to the signed-in user's rows. Throws rather than return a partial backup. */
export async function buildBackup(client: Client, now: Date = new Date()): Promise<Backup> {
  const tables = {} as Backup["tables"];
  for (const table of TABLES) {
    const { data, error } = await client.from(table).select("*");
    if (error) throw new Error(`Couldn't read ${table}: ${error.message}`);
    tables[table] = (data ?? []) as unknown[];
  }
  return {
    app: "vitrine",
    version: 1,
    exported_at: now.toISOString(),
    note: "Photos are stored as links, so keep the image files separately.",
    tables,
  };
}
