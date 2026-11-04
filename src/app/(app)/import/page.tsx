import { ImportView } from "@/components/import-view";
import { localDate } from "@/lib/format";

export const metadata = { title: "Import and export" };

export default function ImportPage() {
  const year = Number(localDate().slice(0, 4));
  const years = Array.from({ length: 5 }, (_, i) => year - i);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10">
      <h1 className="page-title">Import and export</h1>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow border-b pb-2">Export CSV</h2>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <a className="chip justify-center" href="/export/items" download>Items</a>
          <a className="chip justify-center" href="/export/sales" download>Sales</a>
          <a className="chip justify-center" href="/export/expenses" download>Expenses</a>
        </div>
        <a className="chip justify-center text-sm" href="/export/backup" download>Full backup (JSON)</a>
        <p className="text-xs text-muted-foreground">Everything in your account, except the photo files themselves.</p>
        <h3 className="mt-2 text-sm font-medium">Yearly summary</h3>
        <ul className="flex flex-wrap gap-2">
          {years.map((y) => (
            <li key={y}><a className="chip num" href={`/export/summary?year=${y}`} download>{y}</a></li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow border-b pb-2">Import items from CSV</h2>
        <ImportView />
      </section>
    </div>
  );
}
