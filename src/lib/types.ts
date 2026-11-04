export const ITEM_STATUSES = ["personal", "in_stock", "listed", "sold"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const STATUS_LABEL: Record<ItemStatus, string> = {
  personal: "Personal",
  in_stock: "In stock",
  listed: "Listed",
  sold: "Sold",
};

export const CATEGORIES = ["Outerwear", "Tops", "Knitwear", "Bottoms", "Footwear", "Bags", "Accessories", "Other"];
export const CURRENCIES = ["CHF", "EUR", "USD", "GBP", "JPY"];
export const EXPENSE_CATEGORIES = ["Shipping supplies", "Platform subscription", "Cleaning & repair", "Travel", "Authentication", "Other"];

export interface ItemImage {
  id: string;
  item_id: string;
  url: string;
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
  created_at: string;
}

export interface Listing {
  id: string;
  item_id: string;
  platform: string;
  list_price: number | null;
  listed_at: string;
  delisted_at: string | null;
}

export interface PriceChange {
  id: string;
  listing_id: string;
  old_price: number;
  new_price: number;
  changed_at: string;
}

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
}

export interface InventoryItem extends Item {
  item_images: ItemImage[];
  listings: Listing[];
  sales: Sale | null;
}

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
