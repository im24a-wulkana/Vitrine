import Link from "next/link";

export const metadata = { title: "Calendar" };

export default function CalendarPage() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="page-title">Calendar</h1>
      <p className="text-muted-foreground">The month view, weather and outfit log arrive in Phase D. For now, log wears from your closet.</p>
      <Link href="/closet" className="self-start text-sm underline underline-offset-4">Go to closet</Link>
    </div>
  );
}
