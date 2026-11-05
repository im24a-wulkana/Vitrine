import { ExpensesView } from "@/components/expenses-view";
import { requireUser } from "@/lib/session";
import type { Expense } from "@/lib/types";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage() {
  const { db } = await requireUser();
  const { data, error } = await db.from("expenses").select("*").order("date", { ascending: false }).limit(5000);
  if (error) throw new Error(error.message);
  return <ExpensesView expenses={(data ?? []) as Expense[]} />;
}
