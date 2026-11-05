import { csvResponse, unauthorized } from "@/lib/csv-response";
import { getExpenseRows } from "@/lib/sales-data";
import { getUser } from "@/lib/session";

export async function GET() {
  const { db, user } = await getUser();
  if (!user) return unauthorized();

  const expenses = await getExpenseRows(db);
  const rows = [...expenses]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [e.date, e.category, Number(e.amount_chf), e.note]);
  return csvResponse("vitrine-expenses.csv", [["date", "category", "amount_chf", "note"], ...rows]);
}
