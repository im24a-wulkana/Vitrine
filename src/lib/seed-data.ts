// Sample data: 15 made-up items across every status, plus sales, listings, wears,
// an outfit, expenses and a wishlist. Local mode loads it on first run, and
// scripts/seed.ts loads it into Supabase.

// Works with both the Supabase client and the local client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}
function stamp(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
function check<T>(result: { data: T; error: { message: string } | null }, step: string): T {
  if (result.error) throw new Error(`${step} failed: ${result.error.message}`);
  return result.data;
}

type SeedItem = {
  key: string;
  brand: string;
  name: string;
  category: string;
  size: string;
  color: string;
  condition: number;
  price: number;
  currency?: string;
  chf?: number;
  bought: number; // days ago
  source: string;
  tags: string[];
  image: string;
  personal?: boolean;
  listing?: { platform: string; price: number; days: number; repriced?: { from: number; days: number } };
  sale?: { platform: string; price: number; fees: number; shipping: number; days: number; listedDays: number; listPrice: number };
  wears?: number[]; // days ago
};

// Season, occasion, storage and measurement details, by item key.
const DETAILS: Record<string, Record<string, unknown>> = {
  coat: { seasons: ["Autumn", "Winter"], occasions: ["Work", "Evening"], colors: ["Charcoal"], subcategory: "Overcoat", storage_location: "Hall closet", measurements: { pit_to_pit: 58, length: 104, sleeve: 66 }, favorite: true },
  shirt: { seasons: ["Spring", "Summer"], occasions: ["Everyday", "Work"], colors: ["White"], subcategory: "Shirt", storage_location: "Wardrobe rail", measurements: { pit_to_pit: 54, length: 72, sleeve: 64 }, favorite: true },
  boots: { seasons: ["Autumn", "Winter", "Spring"], occasions: ["Everyday", "Work"], colors: ["Black"], subcategory: "Derby", storage_location: "Shoe rack" },
  knit: { seasons: ["Autumn", "Winter"], occasions: ["Everyday"], colors: ["Navy"], subcategory: "Knitwear", storage_location: "Box 1", measurements: { pit_to_pit: 56, length: 68, sleeve: 65 } },
  jeans: { seasons: ["Spring", "Autumn"], occasions: ["Everyday"], colors: ["Indigo"], subcategory: "Denim", storage_location: "Box 1", measurements: { waist: 42, inseam: 80 } },
  tote: { seasons: ["Spring", "Summer"], occasions: ["Everyday", "Travel"], colors: ["Ecru"], subcategory: "Bags", storage_location: "Box 2" },
  parka: { seasons: ["Autumn", "Winter"], occasions: ["Everyday", "Travel"], colors: ["Black"], subcategory: "Shell", storage_location: "Box 2", measurements: { pit_to_pit: 60, length: 82, sleeve: 68 } },
  trousers: { seasons: ["Spring", "Autumn"], occasions: ["Work", "Evening"], colors: ["Khaki"], subcategory: "Tailored", storage_location: "Box 3", measurements: { waist: 41, inseam: 78 } },
  sneakers: { seasons: ["Spring", "Summer", "Autumn"], occasions: ["Sport", "Everyday"], colors: ["Grey"], subcategory: "Sneakers", storage_location: "Shoe rack" },
  cardigan: { seasons: ["Autumn", "Winter"], occasions: ["Everyday", "Evening"], colors: ["Brown"], subcategory: "Knitwear", storage_location: "Box 3" },
  bomber: { seasons: ["Autumn"], occasions: ["Everyday"], colors: ["Olive"], subcategory: "Bomber" },
  blazer: { seasons: ["Spring", "Autumn"], occasions: ["Work", "Formal"], colors: ["Black"], subcategory: "Blazer" },
  loafers: { seasons: ["Spring", "Summer"], occasions: ["Work"], colors: ["Brown"], subcategory: "Loafers" },
  hoodie: { seasons: ["Autumn", "Spring"], occasions: ["Sport", "Everyday"], colors: ["Stone"], subcategory: "Hoodie" },
  bag: { seasons: ["Spring", "Summer", "Autumn"], occasions: ["Evening"], colors: ["Black"], subcategory: "Bags" },
};

const ITEMS: SeedItem[] = [
  // Personal
  { key: "coat", brand: "Margaret Howell", name: "Wool overcoat", category: "Outerwear", size: "M", color: "Charcoal", condition: 9, price: 340, bought: 620, source: "Ricardo", tags: ["wool", "winter"], image: "outerwear", personal: true, wears: [2, 9, 16, 30, 44, 300, 320, 340] },
  { key: "shirt", brand: "Our Legacy", name: "Box shirt", category: "Tops", size: "48", color: "White", condition: 8, price: 95, bought: 400, source: "Vinted", tags: ["cotton"], image: "top", personal: true, wears: [1, 8, 22, 36, 50, 64, 78] },
  { key: "boots", brand: "Paraboot", name: "Michael derby", category: "Shoes", size: "42", color: "Black", condition: 7, price: 180, bought: 520, source: "Flea market", tags: ["leather"], image: "shoe", personal: true, wears: [240, 255, 270] },

  // In stock
  { key: "knit", brand: "Margaret Howell", name: "Merino crewneck", category: "Tops", size: "L", color: "Navy", condition: 9, price: 60, bought: 20, source: "Tutti", tags: ["merino"], image: "top" },
  { key: "jeans", brand: "Acne Studios", name: "1996 straight jeans", category: "Bottoms", size: "32/32", color: "Indigo", condition: 8, price: 75, currency: "EUR", chf: 70.5, bought: 12, source: "Vinted", tags: ["denim"], image: "bottom" },
  { key: "tote", brand: "Lemaire", name: "Canvas tote", category: "Accessories", size: "One size", color: "Ecru", condition: 7, price: 90, bought: 6, source: "Thrift store", tags: ["canvas"], image: "bag" },

  // Listed
  { key: "parka", brand: "Arc'teryx", name: "Shell parka", category: "Outerwear", size: "M", color: "Black", condition: 8, price: 210, bought: 110, source: "Ricardo", tags: ["gore-tex", "technical"], image: "outerwear", listing: { platform: "Grailed", price: 390, days: 75 } },
  { key: "trousers", brand: "Lemaire", name: "Twisted trousers", category: "Bottoms", size: "48", color: "Khaki", condition: 9, price: 120, bought: 70, source: "Vestiaire Collective", tags: ["pleated"], image: "bottom", listing: { platform: "Vestiaire Collective", price: 250, days: 60, repriced: { from: 280, days: 40 } } },
  { key: "sneakers", brand: "Salomon", name: "XT-6 sneakers", category: "Shoes", size: "43", color: "Grey", condition: 8, price: 85, bought: 25, source: "Vinted", tags: ["gorpcore"], image: "shoe", listing: { platform: "Vinted", price: 145, days: 12 } },
  { key: "cardigan", brand: "Our Legacy", name: "Mohair cardigan", category: "Tops", size: "50", color: "Brown", condition: 9, price: 130, bought: 18, source: "Tutti", tags: ["mohair"], image: "top", listing: { platform: "Ricardo", price: 240, days: 5 } },

  // Sold
  { key: "bomber", brand: "Stone Island", name: "Nylon bomber", category: "Outerwear", size: "L", color: "Olive", condition: 8, price: 160, bought: 300, source: "Ricardo", tags: ["nylon"], image: "outerwear", sale: { platform: "Grailed", price: 345, fees: 34.05, shipping: 18, days: 250, listedDays: 285, listPrice: 380 } },
  { key: "blazer", brand: "Acne Studios", name: "Double-breasted blazer", category: "Outerwear", size: "48", color: "Black", condition: 9, price: 110, bought: 200, source: "Vinted", tags: ["tailoring"], image: "outerwear", sale: { platform: "Vestiaire Collective", price: 260, fees: 39, shipping: 12, days: 130, listedDays: 170, listPrice: 290 } },
  { key: "loafers", brand: "Paraboot", name: "Reims loafers", category: "Shoes", size: "42.5", color: "Brown", condition: 8, price: 95, bought: 110, source: "Flea market", tags: ["leather"], image: "shoe", sale: { platform: "Ricardo", price: 215, fees: 19.35, shipping: 11, days: 70, listedDays: 95, listPrice: 240 } },
  { key: "hoodie", brand: "Stone Island", name: "Garment-dyed hoodie", category: "Tops", size: "M", color: "Stone", condition: 7, price: 70, bought: 60, source: "Tutti", tags: ["cotton"], image: "top", sale: { platform: "Vinted", price: 145, fees: 0, shipping: 9, days: 25, listedDays: 50, listPrice: 165 } },
  { key: "bag", brand: "Lemaire", name: "Croissant bag", category: "Accessories", size: "Small", color: "Black", condition: 9, price: 240, bought: 35, source: "Vestiaire Collective", tags: ["leather"], image: "bag", sale: { platform: "Grailed", price: 225, fees: 22.25, shipping: 14, days: 3, listedDays: 28, listPrice: 320 } },
];

export const SAMPLE_ITEM_COUNT = ITEMS.length;

export async function seedSampleData(supabase: Client, userId: string): Promise<void> {
  // Example fee presets. Replace them with your real rates in Settings.
  check(
    await supabase.from("platforms").upsert(
      [
        { user_id: userId, name: "Vinted", fee_percent: 0, fee_fixed: 0 },
        { user_id: userId, name: "Ricardo", fee_percent: 9, fee_fixed: 0 },
        { user_id: userId, name: "Grailed", fee_percent: 9, fee_fixed: 1 },
        { user_id: userId, name: "Vestiaire Collective", fee_percent: 15, fee_fixed: 0 },
        { user_id: userId, name: "Other", fee_percent: 0, fee_fixed: 0 },
      ],
      { onConflict: "user_id,name" },
    ),
    "Platforms",
  );

  const ids = new Map<string, string>();
  for (const item of ITEMS) {
    const row = check(
      await supabase
        .from("items")
        .insert({
          user_id: userId,
          brand: item.brand,
          name: item.name,
          category: item.category,
          size: item.size,
          color: item.color,
          condition: item.condition,
          status: item.personal ? "personal" : "in_stock",
          buy_price: item.price,
          buy_currency: item.currency ?? "CHF",
          buy_price_chf: item.chf ?? item.price,
          buy_date: daysAgo(item.bought),
          buy_source: item.source,
          tags: item.tags,
          notes: "Sample data.",
          created_at: stamp(item.bought),
          ...DETAILS[item.key],
        })
        .select("id")
        .single(),
      `Item ${item.key}`,
    ) as { id: string };
    ids.set(item.key, row.id);

    check(
      await supabase.from("item_images").insert({ item_id: row.id, url: `/placeholders/${item.image}.svg`, is_primary: true, position: 0 }),
      `Image ${item.key}`,
    );

    if (item.listing) {
      const listing = check(
        await supabase
          .from("listings")
          .insert({ item_id: row.id, platform: item.listing.platform, list_price: item.listing.price, listed_at: stamp(item.listing.days) })
          .select("id")
          .single(),
        `Listing ${item.key}`,
      ) as { id: string };
      if (item.listing.repriced) {
        check(
          await supabase.from("price_changes").insert({
            listing_id: listing.id,
            old_price: item.listing.repriced.from,
            new_price: item.listing.price,
            changed_at: stamp(item.listing.repriced.days),
          }),
          `Price change ${item.key}`,
        );
      }
    }

    if (item.sale) {
      check(
        await supabase.from("listings").insert({
          item_id: row.id,
          platform: item.sale.platform,
          list_price: item.sale.listPrice,
          listed_at: stamp(item.sale.listedDays),
        }),
        `Sold listing ${item.key}`,
      );
      check(
        await supabase.from("sales").insert({
          item_id: row.id,
          platform: item.sale.platform,
          sale_price: item.sale.price,
          fees: item.sale.fees,
          shipping_cost: item.sale.shipping,
          sold_at: daysAgo(item.sale.days),
        }),
        `Sale ${item.key}`,
      );
    }

    if (item.wears?.length) {
      check(
        await supabase.from("wears").insert(item.wears.map((d) => ({ item_id: row.id, worn_on: daysAgo(d) }))),
        `Wears ${item.key}`,
      );
    }
  }

  const { data: grailed } = await supabase.from("platforms").select("id").eq("user_id", userId).eq("name", "Grailed").single();
  check(
    await supabase.from("offers").insert([
      { item_id: ids.get("parka"), platform_id: grailed?.id, amount_chf: 300, status: "declined", created_at: stamp(30) },
      { item_id: ids.get("parka"), platform_id: grailed?.id, amount_chf: 340, status: "pending", created_at: stamp(4) },
    ]),
    "Offers",
  );

  check(
    await supabase.from("expenses").insert([
      { user_id: userId, category: "Shipping supplies", amount_chf: 38.5, date: daysAgo(200), note: "Boxes and tape" },
      { user_id: userId, category: "Cleaning & repair", amount_chf: 45, date: daysAgo(90), note: "Resole" },
      { user_id: userId, category: "Shipping supplies", amount_chf: 22, date: daysAgo(40), note: "Mailers" },
      { user_id: userId, category: "Cleaning & repair", amount_chf: 28, date: daysAgo(2), note: "Dry cleaning" },
    ]),
    "Expenses",
  );

  check(
    await supabase.from("wishlist").insert([
      { user_id: userId, brand: "Lemaire", name: "Military parka", target_price: 450, notes: "Size 48 only" },
      { user_id: userId, brand: "Paraboot", name: "Chambord", target_price: 220 },
      { user_id: userId, brand: "Margaret Howell", name: "Linen shirt", target_price: 110 },
    ]),
    "Wishlist",
  );

  const outfit = check(
    await supabase.from("outfits").insert({ user_id: userId, name: "Office, cold day" }).select("id").single(),
    "Outfit",
  ) as { id: string };
  check(
    await supabase.from("outfit_items").insert(
      ["coat", "shirt", "boots"].map((key, position) => ({ outfit_id: outfit.id, item_id: ids.get(key), position })),
    ),
    "Outfit items",
  );
}
