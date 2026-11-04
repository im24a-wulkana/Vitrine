import Link from "next/link";
import { DashboardCharts } from "@/components/charts-client";
import { BUSINESS_LINKS } from "@/lib/business-links";
import { localDate, money, moneyWhole, percent, signedMoney } from "@/lib/format";
import { groupSales, profitByMonth, summarize, type Period } from "@/lib/metrics";
import { getAgingAlerts, getSettings } from "@/lib/queries";
import { getExpenseRows, getSaleRows } from "@/lib/sales-data";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Business" };

const PERIODS: { value: Period; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All time" },
];

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-t pt-2">
      <dt className="eyebrow">{label}</dt>
      <dd className="num mt-1 text-2xl">{value}</dd>
      {note && <dd className="num text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: rawPeriod } = await searchParams;
  const period: Period = rawPeriod === "year" || rawPeriod === "all" ? rawPeriod : "month";

  const { supabase, user } = await requireUser();
  const today = localDate();
  const [sales, expenses, settings, { data: stock }] = await Promise.all([
    getSaleRows(supabase),
    getExpenseRows(supabase),
    getSettings(supabase, user.id),
    supabase.from("items").select("buy_price_chf, listings(list_price, delisted_at)").in("status", ["in_stock", "listed"]).limit(20000),
  ]);
  const alerts = await getAgingAlerts(supabase, settings, today);

  const summary = summarize(sales, expenses, period, today);
  const stockRows = (stock ?? []) as { buy_price_chf: number; listings: { list_price: number | null; delisted_at: string | null }[] }[];
  const stockCost = stockRows.reduce((sum, i) => sum + Number(i.buy_price_chf), 0);
  const askingTotal = stockRows.reduce((sum, i) => {
    const prices = i.listings.filter((l) => !l.delisted_at && l.list_price !== null).map((l) => Number(l.list_price));
    return sum + (prices.length ? Math.max(...prices) : 0);
  }, 0);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <h1 className="page-title">Business</h1>
        <nav aria-label="Business pages" className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto border-b px-4 pb-2.5 text-sm md:hidden">
          {BUSINESS_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="whitespace-nowrap text-muted-foreground">
              {l.label}
              {l.href === "/alerts" && alerts.length > 0 && <span className="num ml-1 rounded-sm bg-foreground px-1 text-[10px] text-background">{alerts.length}</span>}
            </Link>
          ))}
        </nav>
        <nav aria-label="Period" className="flex gap-1.5">
          {PERIODS.map((p) => (
            <Link key={p.value} href={`/dashboard?period=${p.value}`} className="chip" data-active={period === p.value} aria-current={period === p.value ? "true" : undefined}>
              {p.label}
            </Link>
          ))}
        </nav>
      </header>

      <section aria-label="Net profit">
        <p className="eyebrow">Net profit, CHF</p>
        <p className="num mt-1 text-6xl leading-none tracking-tight md:text-7xl">{signedMoney(summary.netProfit)}</p>
        <p className="num mt-2 text-sm text-muted-foreground">
          {signedMoney(summary.tradingProfit)} from {summary.salesCount} {summary.salesCount === 1 ? "sale" : "sales"} − {money(summary.expenses)} expenses
        </p>
      </section>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4">
        <Stat label="Inventory at cost" value={moneyWhole(stockCost)} note={`${stockRows.length} items`} />
        <Stat label="Asking total" value={moneyWhole(askingTotal)} note="open listings" />
        <Stat label="Average ROI" value={percent(summary.avgRoi)} note="per sold item" />
        <Stat label="Days to sell" value={summary.avgDaysToSell === null ? "—" : String(Math.round(summary.avgDaysToSell))} note="average" />
      </dl>

      {alerts.length > 0 && (
        <section>
          <h2 className="eyebrow mb-1 border-b pb-2">Sitting too long</h2>
          <ul>
            {alerts.slice(0, 3).map((a) => (
              <li key={a.listing_id} className="flex items-center justify-between gap-3 border-b py-2 text-sm">
                <Link href={`/items/${a.item_id}`} className="min-w-0 truncate">{a.brand} · {a.name}</Link>
                <span className="num shrink-0 text-muted-foreground">{a.age_days}d</span>
              </li>
            ))}
          </ul>
          <Link href="/alerts" className="mt-2 inline-block text-sm underline underline-offset-4">
            Review {alerts.length} {alerts.length === 1 ? "listing" : "listings"}
          </Link>
        </section>
      )}

      <DashboardCharts
        months={profitByMonth(sales, expenses, today)}
        brands={groupSales(sales, "brand", period, today)}
        platforms={groupSales(sales, "platform", period, today)}
      />
    </div>
  );
}
