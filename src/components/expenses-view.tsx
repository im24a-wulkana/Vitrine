"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addExpense, deleteExpense } from "@/lib/actions/records";
import { localDate, money, shortDate } from "@/lib/format";
import { EXPENSE_CATEGORIES, type Expense } from "@/lib/types";

export function ExpensesView({ expenses }: { expenses: Expense[] }) {
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localDate());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const year = localDate().slice(0, 4);
  const yearTotal = expenses.filter((e) => e.date.startsWith(year)).reduce((sum, e) => sum + Number(e.amount_chf), 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (amount === "" || !(Number(amount) >= 0)) return setError("Enter an amount");
    setError(null);
    start(async () => {
      const res = await addExpense({ category, amount_chf: Number(amount), date, note });
      if (!res.ok) return setError(res.error);
      setAmount("");
      setNote("");
    });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <header className="flex items-end justify-between gap-4">
        <h1 className="page-title">Expenses</h1>
        <p className="text-right">
          <span className="eyebrow block">{year}, CHF</span>
          <span className="num text-2xl">{money(yearTotal)}</span>
        </p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-3 border-y py-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="expense-amount">Amount, CHF</Label>
            <Input id="expense-amount" inputMode="decimal" className="num" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="expense-date">Date</Label>
            <Input id="expense-date" type="date" className="num" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expense-category">Category</Label>
          <select id="expense-category" className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expense-note">Note</Label>
          <Input id="expense-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm font-medium">{error}</p>}
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add expense"}</Button>
      </form>

      {expenses.length === 0 ? (
        <p className="text-muted-foreground">No expenses yet. They are subtracted from your profit on the Business page.</p>
      ) : (
        <ul>
          {expenses.map((expense) => (
            <li key={expense.id} className="flex items-center gap-3 border-b py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{expense.category}{expense.note ? ` · ${expense.note}` : ""}</p>
                <p className="num text-xs text-muted-foreground">{shortDate(expense.date)}</p>
              </div>
              <span className="num text-sm">{money(expense.amount_chf)}</span>
              <button type="button" aria-label={`Delete ${expense.category} expense`} disabled={pending} className="grid size-10 place-items-center text-muted-foreground" onClick={() => start(async () => { await deleteExpense(expense.id); })}>
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
