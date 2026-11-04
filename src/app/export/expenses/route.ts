import { csvResponse, unauthorized } from "@/lib/csv-response";
import { getExpenseRows } from "@/lib/sales-data";
import { getUser } from "@/lib/supabase/server";

export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return unauthorized();

  const expenses = await getExpenseRows(supabase);
  const rows = [...expenses]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [e.date, e.category, Number(e.amount_chf), e.note]);
  return csvResponse("vitrine-expenses.csv", [["date", "category", "amount_chf", "note"], ...rows]);
}
