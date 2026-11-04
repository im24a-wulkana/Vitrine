import { NextResponse, type NextRequest } from "next/server";
import { csvResponse, unauthorized } from "@/lib/csv-response";
import { yearlySummary } from "@/lib/metrics";
import { getExpenseRows, getSaleRows } from "@/lib/sales-data";
import { getUser } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return unauthorized();

  const year = Number(request.nextUrl.searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const [sales, expenses] = await Promise.all([getSaleRows(supabase), getExpenseRows(supabase)]);
  const { months, total } = yearlySummary(sales, expenses, year);

  const byCategory = new Map<string, number>();
  for (const e of expenses.filter((x) => x.date.startsWith(String(year)))) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Number(e.amount_chf));
  }

  const toRow = (r: typeof total) => [r.month, r.sales, r.revenue, r.fees, r.shipping, r.cost, r.profit, r.expenses, r.net];
  return csvResponse(`vitrine-summary-${year}.csv`, [
    [`Vitrine summary ${year} (CHF)`],
    [],
    ["month", "items_sold", "revenue", "fees", "shipping", "cost_of_goods", "trading_profit", "expenses", "net_profit"],
    ...months.map(toRow),
    toRow(total),
    [],
    ["expense_category", "amount_chf"],
    ...[...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([category, amount]) => [category, Math.round(amount * 100) / 100]),
  ]);
}
