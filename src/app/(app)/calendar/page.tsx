import { CalendarView, type CalendarOutfit, type CalendarPiece, type WearLog } from "@/components/calendar-view";
import { localDate } from "@/lib/format";
import { getSettings } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { getWeather } from "@/lib/weather";

export const metadata = { title: "Calendar" };

/** The first and last dates the grid can show, including days from neighbouring months. */
function gridRange(month: string): [string, string] {
  const [year, m] = month.split("-").map(Number);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return [iso(new Date(Date.UTC(year, m - 1, -6))), iso(new Date(Date.UTC(year, m, 7)))];
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: requested } = await searchParams;
  const today = localDate();
  const month = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : today.slice(0, 7);
  const [from, to] = gridRange(month);

  const { db, user } = await requireUser();
  const [settings, { data: logs, error }, { data: pieces }, { data: outfits }] = await Promise.all([
    getSettings(db, user.id),
    db.from("wear_logs").select("*").gte("date", from).lte("date", to),
    db.from("items").select("id, brand, name, status, item_images(url, is_primary, position, cutout_url)").order("brand").limit(5000),
    db.from("outfits").select("id, name, mode, outfit_items(item_id, x, y, scale, rotation, z_index)").order("created_at", { ascending: false }),
  ]);
  if (error) throw new Error(error.message);

  const weather = settings.lat !== null && settings.lon !== null ? await getWeather(settings.lat, settings.lon) : null;

  return (
    <CalendarView
      month={month}
      today={today}
      logs={(logs ?? []) as WearLog[]}
      pieces={(pieces ?? []) as CalendarPiece[]}
      outfits={(outfits ?? []) as CalendarOutfit[]}
      weather={weather}
      city={settings.city}
      hasLocation={settings.lat !== null}
    />
  );
}
