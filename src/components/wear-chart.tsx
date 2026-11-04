import { localDate } from "@/lib/format";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/** Wears per month for the last 12 months. Each bar has a text label, so it reads without hovering. */
export function WearChart({ wears }: { wears: { worn_on: string }[] }) {
  const today = localDate();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  const points = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 11 + i, 1));
    const key = d.toISOString().slice(0, 7);
    return { key, label: MONTHS[d.getUTCMonth()], count: wears.filter((w) => w.worn_on.startsWith(key)).length };
  });
  const max = Math.max(1, ...points.map((p) => p.count));

  return (
    <figure>
      <figcaption className="eyebrow mb-2">Wears, last 12 months</figcaption>
      <ul className="grid h-20 grid-cols-12 gap-1">
        {points.map((p) => (
          <li key={p.key} title={`${p.key}: ${p.count}`} className="flex flex-col items-center justify-end gap-1">
            <span className="sr-only">{p.key}: {p.count} wears</span>
            <span aria-hidden className="w-full rounded-t-sm bg-foreground" style={{ height: `${(p.count / max) * 100}%`, minHeight: 1, opacity: p.count ? 1 : 0.2 }} />
            <span aria-hidden className="num text-[10px] text-muted-foreground">{p.label}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
