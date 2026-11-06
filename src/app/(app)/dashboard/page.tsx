import Link from "next/link";
import { DashboardCharts } from "@/components/charts-client";
import { BUSINESS_LINKS } from "@/lib/business-links";
import { localDate, money, moneyWhole, percent, signedMoney } from "@/lib/format";
import { groupSales, profitByMonth, sellThroughRate, summarize, wardrobeValue, type Period } from "@/lib/metrics";
import { getAgingAlerts, getSettings } from "@/lib/queries";
import { getExpenseRows, getSaleRows } from "@/lib/sales-data";
import { requireUser } from "@/lib/session";

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

  const { db, user } = await requireUser();
  const today = localDate();
  const [sales, expenses, settings, { data: stock }, { data: owned }] = await Promise.all([
    getSaleRows(db),
    getExpenseRows(db),
    getSettings(db, user.id),
    db.from("items").select("buy_price_chf, listings(list_price, delisted_at)").in("status", ["in_stock", "listed"]).limit(20000),
    db.from("items").select("status, buy_price_chf").neq("status", "sold").limit(20000),
  ]);
  const [alerts, { count: toShip }, { count: toDelist }] = await Promise.all([
    getAgingAlerts(db, settings, today),
    db.from("sales").select("id", { count: "exact", head: true }).eq("shipping_status", "to_ship"),
    db.from("listings").select("id", { count: "exact", head: true }).eq("needs_delisting", true),
  ]);
  const goal = settings.monthly_profit_goal_chf === null ? null : Number(settings.monthly_profit_goal_chf);
  const monthNet = summarize(sales, expenses, "month", today).netProfit;

  const summary = summarize(sales, expenses, period, today);
  const stockRows = (stock ?? []) as { buy_price_chf: number; listings: { list_price: number | null; delisted_at: string | null }[] }[];
  const stockCost = stockRows.reduce((sum, i) => sum + Number(i.buy_price_chf), 0);
  const askingTotal = stockRows.reduce((sum, i) => {
    const prices = i.listings.filter((l) => !l.delisted_at && l.list_price !== null).map((l) => Number(l.list_price));
    return sum + (prices.length ? Math.max(...prices) : 0);
  }, 0);

  const wardrobe = wardrobeValue((owned ?? []) as { status: string; buy_price_chf: number }[]);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <h1 className="page-title">Business</h1>
        <nav aria-label="Business pages" className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto border-b px-4 pb-1 text-sm md:hidden">
          {BUSINESS_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="py-2 whitespace-nowrap text-muted-foreground">
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
        <Stat label="Sell-through" value={percent(sellThroughRate(sales.length, stockRows.length))} note={`${sales.length} of ${sales.length + stockRows.length}, all time`} />
      </dl>

      <section aria-label="Wardrobe value">
        <p className="eyebrow">Wardrobe value, CHF</p>
        <p className="num mt-1 text-4xl leading-none tracking-tight">{money(wardrobe.total)}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          What you paid for the <span className="num">{wardrobe.count}</span> {wardrobe.count === 1 ? "item" : "items"} you still own. Today, not this period.
        </p>
        <dl className="num mt-3 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 text-sm">
          {([["Personal", wardrobe.byStatus.personal], ["In stock", wardrobe.byStatus.in_stock], ["For sale", wardrobe.byStatus.listed]] as const).map(([label, group]) => (
            <div key={label} className="contents">
              <dt className="font-sans text-muted-foreground">{label}</dt>
              <dd className="text-right text-muted-foreground">{group.count}</dd>
              <dd className="text-right">{money(group.total)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {goal !== null && goal > 0 && (
        <section aria-label="Monthly profit goal">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="eyebrow">Goal this month</h2>
            <p className="num text-sm">{signedMoney(monthNet)} <span className="text-muted-foreground">/ {moneyWhole(goal)}</span></p>
          </div>
          <div role="progressbar" aria-label="Progress toward this month's profit goal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, Math.max(0, monthNet / goal)) * 100)} className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-foreground" style={{ width: `${Math.min(1, Math.max(0, monthNet / goal)) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{monthNet >= goal ? "Reached." : <><span className="num">{money(goal - monthNet)}</span> to go.</>}</p>
        </section>
      )}

      {((toShip ?? 0) > 0 || (toDelist ?? 0) > 0) && (
        <Link href="/shipping" className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2.5 text-sm">
          <span>
            {(toShip ?? 0) > 0 && <><span className="num">{toShip}</span> to ship</>}
            {(toShip ?? 0) > 0 && (toDelist ?? 0) > 0 && " · "}
            {(toDelist ?? 0) > 0 && <><span className="num">{toDelist}</span> to delist</>}
          </span>
          <span className="underline underline-offset-4">Open</span>
        </Link>
      )}

      {alerts.length > 0 && (
        <section>
          <h2 className="eyebrow mb-1 border-b pb-2">Sitting too long</h2>
          <ul>
            {alerts.slice(0, 3).map((a) => (
              <li key={a.listing_id} className="flex items-center justify-between gap-3 border-b py-2 text-sm">
                <Link href={`/items/${a.item_id}`} className="min-w-0 truncate py-1">{a.brand} · {a.name}</Link>
                <span className="num shrink-0 text-muted-foreground">{a.age_days}d</span>
              </li>
            ))}
          </ul>
          <Link href="/alerts" className="mt-1 inline-block py-1.5 text-sm underline underline-offset-4">
            Review {alerts.length} {alerts.length === 1 ? "listing" : "listings"}
          </Link>
        </section>
      )}

      <DashboardCharts
        months={profitByMonth(sales, expenses, today)}
        brands={groupSales(sales, "brand", period, today)}
        platforms={groupSales(sales, "platform", period, today)}
        sizes={groupSales(sales, "size", period, today)}
      />
    </div>
  );
}
