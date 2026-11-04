export const ITEM_STATUSES = ["personal", "in_stock", "listed", "sold"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const STATUS_LABEL: Record<ItemStatus, string> = {
  personal: "Personal",
  in_stock: "In stock",
  listed: "Listed",
  sold: "Sold",
};

export const CATEGORIES = ["Tops", "Bottoms", "Outerwear", "Shoes", "Accessories", "Activewear"];
export const CLOSET_TABS = ["All", ...CATEGORIES] as const;
export type ClosetTab = (typeof CLOSET_TABS)[number];
export const SEASONS = ["Spring", "Summer", "Autumn", "Winter"];
export const OCCASIONS = ["Everyday", "Work", "Evening", "Formal", "Sport", "Travel"];

/** Maps any stored category, including older or imported names, to a closet tab. */
export function closetTab(category: string | null): ClosetTab | null {
  if (!category) return null;
  const aliases: Record<string, ClosetTab> = { knitwear: "Tops", footwear: "Shoes", bags: "Accessories" };
  const key = category.trim().toLowerCase();
  return aliases[key] ?? CATEGORIES.find((c) => c.toLowerCase() === key) ?? null;
}

export const MEASUREMENTS = [
  ["pit_to_pit", "Pit to pit"],
  ["length", "Length"],
  ["sleeve", "Sleeve"],
  ["waist", "Waist"],
  ["inseam", "Inseam"],
] as const;
export type Measurements = Partial<Record<(typeof MEASUREMENTS)[number][0], number>>;
export const CURRENCIES = ["CHF", "EUR", "USD", "GBP", "JPY"];
export const EXPENSE_CATEGORIES = ["Shipping supplies", "Platform subscription", "Cleaning & repair", "Travel", "Authentication", "Other"];

export interface ItemImage {
  id: string;
  item_id: string;
  url: string;
  original_url: string | null;
  cutout_url: string | null;
  is_primary: boolean;
  position: number;
}

export interface Item {
  id: string;
  user_id: string;
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
  subcategory: string | null;
  color_primary: string | null;
  colors: string[];
  seasons: string[];
  occasions: string[];
  storage_location: string | null;
  measurements: Measurements;
  favorite: boolean;
  lot_id: string | null;
  created_at: string;
}

export interface Listing {
  id: string;
  item_id: string;
  platform: string;
  list_price: number | null;
  listed_at: string;
  delisted_at: string | null;
  needs_delisting: boolean;
}

export interface PriceChange {
  id: string;
  listing_id: string;
  old_price: number;
  new_price: number;
  changed_at: string;
}

export type ShippingStatus = "to_ship" | "shipped" | "delivered" | "returned";

export interface Sale {
  id: string;
  item_id: string;
  platform: string;
  sale_price: number;
  fees: number;
  shipping_cost: number;
  item_cost_chf: number;
  sold_at: string;
  net_profit: number;
  tracking_number: string | null;
  shipping_status: ShippingStatus;
}

export interface Platform {
  id: string;
  name: string;
  fee_percent: number;
  fee_fixed: number;
}

export interface Expense {
  id: string;
  category: string;
  amount_chf: number;
  date: string;
  note: string | null;
}

export interface WishlistEntry {
  id: string;
  brand: string | null;
  name: string;
  target_price: number | null;
  link: string | null;
  notes: string | null;
}

export interface UserSettings {
  user_id: string;
  default_currency: string;
  aging_threshold_days: number;
  markdown_percent: number;
  monthly_profit_goal_chf: number | null;
}

export interface Offer {
  id: string;
  amount_chf: number;
  status: "pending" | "accepted" | "declined" | "countered";
  created_at: string;
  platforms: { name: string } | null;
}

export interface InventoryItem extends Item {
  item_images: ItemImage[];
  listings: Listing[];
  sales: Sale | null;
}

export interface ClosetItem extends InventoryItem {
  wears: { worn_on: string }[];
}

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
