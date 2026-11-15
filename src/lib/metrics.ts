import { estimateFees, type FeePlatform } from "./fees";
import { daysBetween, roundMoney } from "./format";

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

export function feeFor(platform: FeePlatform | undefined, price: number): number {
  return estimateFees(platform, price).total;
}

/** Same formula as the sales.net_profit generated column. */
export function netProfit(salePrice: number, fees: number, shipping: number, cost: number): number {
  return roundMoney(salePrice - fees - shipping - cost);
}

// ---------------------------------------------------------------------------
// Aging
// ---------------------------------------------------------------------------

export interface AgingInput {
  listed_at: string;
  list_price: number | null;
  price_changes?: { changed_at: string }[];
}

/**
 * Days since the listing last got attention: its start or latest price change.
 * Applying a markdown therefore restarts the clock rather than leaving the
 * alert on screen.
 */
export function listingAgeDays(listing: AgingInput, today: string): number {
  const dates = [listing.listed_at, ...(listing.price_changes ?? []).map((c) => c.changed_at)];
  const latest = dates.reduce((a, b) => (Date.parse(a) > Date.parse(b) ? a : b));
  return daysBetween(latest, today);
}

export function suggestedMarkdown(price: number, percentOff: number): number {
  return Math.round(price * (1 - percentOff / 100));
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export type Period = "month" | "year" | "all";

export interface SaleRow {
  sold_at: string;
  platform: string;
  sale_price: number;
  fees: number;
  shipping_cost: number;
  item_cost_chf: number;
  net_profit: number;
  brand: string;
  size?: string | null;
  /** Start of the clock for days-to-sell: first listing, else purchase date. */
  started_at: string | null;
}

export interface ExpenseRow {
  date: string;
  amount_chf: number;
  category?: string;
}

export function inPeriod(date: string, period: Period, today: string): boolean {
  if (period === "all") return true;
  if (period === "year") return date.slice(0, 4) === today.slice(0, 4);
  return date.slice(0, 7) === today.slice(0, 7);
}

export interface Summary {
  salesCount: number;
  revenue: number;
  tradingProfit: number;
  expenses: number;
  netProfit: number;
  /** Mean of per-item ROI. Null when no sold item has a known cost. */
  avgRoi: number | null;
  /** Null when no sold item has a start date. */
  avgDaysToSell: number | null;
}

export function summarize(sales: SaleRow[], expenses: ExpenseRow[], period: Period, today: string): Summary {
  const s = sales.filter((x) => inPeriod(x.sold_at, period, today));
  const e = expenses.filter((x) => inPeriod(x.date, period, today));

  const tradingProfit = sum(s.map((x) => Number(x.net_profit)));
  const expenseTotal = sum(e.map((x) => Number(x.amount_chf)));

  const rois = s.filter((x) => Number(x.item_cost_chf) > 0).map((x) => Number(x.net_profit) / Number(x.item_cost_chf));
  const durations = s
    .filter((x) => x.started_at)
    .map((x) => daysBetween(x.started_at as string, x.sold_at))
    .filter((d) => d >= 0);

  return {
    salesCount: s.length,
    revenue: roundMoney(sum(s.map((x) => Number(x.sale_price)))),
    tradingProfit: roundMoney(tradingProfit),
    expenses: roundMoney(expenseTotal),
    netProfit: roundMoney(tradingProfit - expenseTotal),
    avgRoi: rois.length ? sum(rois) / rois.length : null,
    avgDaysToSell: durations.length ? sum(durations) / durations.length : null,
  };
}

export interface MonthPoint {
  month: string; // YYYY-MM
  profit: number; // net of that month's expenses
}

/** The last `count` calendar months ending at today, including months with no activity. */
export function profitByMonth(sales: SaleRow[], expenses: ExpenseRow[], today: string, count = 12): MonthPoint[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  const points: MonthPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - i, 1));
    const key = d.toISOString().slice(0, 7);
    const profit =
      sum(sales.filter((s) => s.sold_at.startsWith(key)).map((s) => Number(s.net_profit))) -
      sum(expenses.filter((e) => e.date.startsWith(key)).map((e) => Number(e.amount_chf)));
    points.push({ month: key, profit: roundMoney(profit) });
  }
  return points;
}

export interface GroupPoint {
  name: string;
  profit: number;
  revenue: number;
  count: number;
}

export function groupSales(sales: SaleRow[], key: "brand" | "platform" | "size", period: Period, today: string, limit = 6): GroupPoint[] {
  const groups = new Map<string, GroupPoint>();
  for (const s of sales.filter((x) => inPeriod(x.sold_at, period, today))) {
    const name = s[key];
    if (!name) continue;
    const g = groups.get(name) ?? { name, profit: 0, revenue: 0, count: 0 };
    g.profit = roundMoney(g.profit + Number(s.net_profit));
    g.revenue = roundMoney(g.revenue + Number(s.sale_price));
    g.count += 1;
    groups.set(name, g);
  }
  return [...groups.values()].sort((a, b) => b.profit - a.profit).slice(0, limit);
}

export interface YearRow {
  month: string;
  sales: number;
  revenue: number;
  fees: number;
  shipping: number;
  cost: number;
  profit: number;
  expenses: number;
  net: number;
}

/** Twelve monthly rows for the yearly summary export, plus a total row. */
export function yearlySummary(sales: SaleRow[], expenses: ExpenseRow[], year: number): { months: YearRow[]; total: YearRow } {
  const months: YearRow[] = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    const s = sales.filter((x) => x.sold_at.startsWith(key));
    const exp = sum(expenses.filter((x) => x.date.startsWith(key)).map((x) => Number(x.amount_chf)));
    const profit = sum(s.map((x) => Number(x.net_profit)));
    months.push({
      month: key,
      sales: s.length,
      revenue: roundMoney(sum(s.map((x) => Number(x.sale_price)))),
      fees: roundMoney(sum(s.map((x) => Number(x.fees)))),
      shipping: roundMoney(sum(s.map((x) => Number(x.shipping_cost)))),
      cost: roundMoney(sum(s.map((x) => Number(x.item_cost_chf)))),
      profit: roundMoney(profit),
      expenses: roundMoney(exp),
      net: roundMoney(profit - exp),
    });
  }
  const total: YearRow = { month: "Total", sales: 0, revenue: 0, fees: 0, shipping: 0, cost: 0, profit: 0, expenses: 0, net: 0 };
  for (const row of months) {
    total.sales += row.sales;
    for (const k of ["revenue", "fees", "shipping", "cost", "profit", "expenses", "net"] as const) {
      total[k] = roundMoney(total[k] + row[k]);
    }
  }
  return { months, total };
}

// ---------------------------------------------------------------------------
// Wardrobe
// ---------------------------------------------------------------------------

export function costPerWear(cost: number, wearCount: number): number | null {
  return wearCount > 0 ? roundMoney(cost / wearCount) : null;
}

/**
 * True when an item has gone `months` without a wear. An item that has never
 * been worn counts from its purchase date, so something bought last week is
 * not flagged.
 */
export function isUnworn(lastWorn: string | null, acquired: string, today: string, months = 6): boolean {
  const reference = lastWorn ?? acquired;
  const cutoff = new Date(`${today.slice(0, 10)}T00:00:00Z`);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return Date.parse(`${reference.slice(0, 10)}T00:00:00Z`) <= cutoff.getTime();
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------------
// Business tools
// ---------------------------------------------------------------------------

/**
 * The highest buy price that still reaches the target return, where
 * ROI = net profit / cost. Solving for cost: (sale - fees - shipping) / (1 + ROI).
 * Rounded down, because rounding up would miss the target.
 */
export function maxBuyPrice(salePrice: number, fees: number, shipping: number, targetRoi: number): number {
  const net = salePrice - fees - shipping;
  if (net <= 0 || targetRoi <= -1) return 0;
  return Math.floor(roundMoney((net / (1 + targetRoi)) * 100)) / 100;
}

export interface CompRow {
  brand: string;
  category: string | null;
  sale_price: number;
}

export interface Comps {
  scope: string;
  count: number;
  median: number;
  low: number;
  high: number;
}

/** Past sale prices, from the most specific match that exists: brand and category, then brand, then category. */
export function priceComps(rows: CompRow[], brand: string, category: string | null): Comps | null {
  const wantedBrand = brand.trim().toLowerCase();
  const sameBrand = (r: CompRow) => wantedBrand !== "" && r.brand.trim().toLowerCase() === wantedBrand;
  const sameCategory = (r: CompRow) => !!category && r.category === category;

  const scopes: [string, CompRow[]][] = [
    [`${brand.trim()} ${(category ?? "").toLowerCase()}`, rows.filter((r) => sameBrand(r) && sameCategory(r))],
    [brand.trim(), rows.filter(sameBrand)],
    [(category ?? "").toLowerCase(), rows.filter(sameCategory)],
  ];
  const match = scopes.find(([, list]) => list.length > 0);
  if (!match) return null;

  const prices = match[1].map((r) => Number(r.sale_price)).sort((a, b) => a - b);
  const mid = Math.floor(prices.length / 2);
  return {
    scope: match[0],
    count: prices.length,
    median: prices.length % 2 ? prices[mid] : roundMoney((prices[mid - 1] + prices[mid]) / 2),
    low: prices[0],
    high: prices[prices.length - 1],
  };
}

/** Share of everything ever held for resale that has sold. Personal items don't count. */
export function sellThroughRate(soldCount: number, unsoldStockCount: number): number | null {
  const total = soldCount + unsoldStockCount;
  return total > 0 ? soldCount / total : null;
}

export function lotSummary(items: { buy_price_chf?: number; sales: { sale_price: number; net_profit: number } | null }[]) {
  const sold = items.filter((i) => i.sales);
  const revenue = roundMoney(sold.reduce((sum, i) => sum + Number(i.sales?.sale_price ?? 0), 0));
  const profit = roundMoney(sold.reduce((sum, i) => sum + Number(i.sales?.net_profit ?? 0), 0));
  // What actually came back after fees and shipping: an item's profit plus its share of the cost.
  const recovered = roundMoney(sold.reduce((sum, i) => sum + Number(i.sales?.net_profit ?? 0) + Number(i.buy_price_chf ?? 0), 0));
  return { count: items.length, sold: sold.length, revenue, profit, recovered };
}

export interface WardrobeValue {
  total: number;
  count: number;
  byStatus: { personal: { count: number; total: number }; in_stock: { count: number; total: number }; listed: { count: number; total: number } };
}

/** What everything you still own cost you. Sold items don't count. */
export function wardrobeValue(rows: { status: string; buy_price_chf: number | string | null }[]): WardrobeValue {
  const byStatus = { personal: { count: 0, total: 0 }, in_stock: { count: 0, total: 0 }, listed: { count: 0, total: 0 } };
  for (const row of rows) {
    if (row.status !== "personal" && row.status !== "in_stock" && row.status !== "listed") continue;
    byStatus[row.status].count += 1;
    byStatus[row.status].total = roundMoney(byStatus[row.status].total + Number(row.buy_price_chf ?? 0));
  }
  const groups = Object.values(byStatus);
  return {
    total: roundMoney(groups.reduce((sum, g) => sum + g.total, 0)),
    count: groups.reduce((sum, g) => sum + g.count, 0),
    byStatus,
  };
}

/** What the item you got in a trade counts as costing: yours, plus cash paid, minus cash received. */
export function tradeCost(tradedItemCost: number, cashPaid: number, cashReceived: number): number {
  return Math.max(0, roundMoney(Number(tradedItemCost) + cashPaid - cashReceived));
}
