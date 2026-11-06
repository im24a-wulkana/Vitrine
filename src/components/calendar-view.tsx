"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, ImagePlus, Loader2, MapPin, Plus, Sun, X } from "lucide-react";
import { DayPicker, type DayButtonProps } from "react-day-picker";
import { CanvasPreview } from "@/components/canvas-preview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { discardUploads } from "@/lib/actions/items";
import { setLocation } from "@/lib/actions/records";
import { deleteWearLog, saveWearLog } from "@/lib/actions/wardrobe";
import { imageFitClass, localDate, primaryImage, shortDate } from "@/lib/format";
import type { Placement } from "@/lib/outfits";
import { uploadPhotoBlob } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { weatherKind, type Weather, type WeatherKind } from "@/lib/weather";

export interface WearLog {
  id: string;
  date: string;
  outfit_id: string | null;
  item_ids: string[];
  photo_url: string | null;
  weather: Weather | null;
}

export interface CalendarPiece {
  id: string;
  brand: string;
  name: string;
  status: string;
  item_images: { url: string; is_primary: boolean; position: number; cutout_url: string | null }[];
}

export interface CalendarOutfit {
  id: string;
  name: string;
  mode: "canvas" | "slots";
  outfit_items: Placement[];
}

const WEATHER_ICONS: Record<WeatherKind, typeof Sun> = { clear: Sun, cloud: Cloud, fog: CloudFog, rain: CloudRain, snow: CloudSnow, storm: CloudLightning };

function WeatherBanner({ weather, city, hasLocation }: { weather: Weather | null; city: string | null; hasLocation: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function useBrowserLocation() {
    if (!navigator.geolocation) return setMessage("This browser can't share its location. Set a city in Settings.");
    setMessage("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        start(async () => {
          const res = await setLocation({ city: null, lat: position.coords.latitude, lon: position.coords.longitude });
          setMessage(res.ok ? null : res.error);
          router.refresh();
        });
      },
      () => setMessage("Couldn't get your location. Set a city in Settings instead."),
      { timeout: 8000, maximumAge: 600000 },
    );
  }

  if (weather) {
    const Icon = WEATHER_ICONS[weatherKind(weather.code)];
    return (
      <section aria-label="Today's weather" className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2.5">
        <Icon className="size-6 shrink-0" strokeWidth={1.5} />
        <p className="num text-2xl leading-none">{weather.temp}°</p>
        <p className="min-w-0 flex-1 truncate text-sm">
          {weather.label}
          {city && <span className="text-muted-foreground"> · {city}</span>}
        </p>
        <p className="num shrink-0 text-xs text-muted-foreground">{weather.low}° / {weather.high}°</p>
      </section>
    );
  }

  return (
    <section aria-label="Weather" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
      <p className="min-w-0">{message ?? (hasLocation ? "Weather isn't available right now." : "Add your location to see the weather.")}</p>
      {!hasLocation && (
        <span className="flex items-center gap-3">
          <button type="button" disabled={pending} className="inline-flex items-center gap-1 underline underline-offset-4" onClick={useBrowserLocation}>
            <MapPin className="size-3.5" /> Use my location
          </button>
          <Link href="/settings" className="underline underline-offset-4">Set a city</Link>
        </span>
      )}
    </section>
  );
}

interface SheetProps {
  date: string;
  log: WearLog | undefined;
  today: string;
  weather: Weather | null;
  pieces: CalendarPiece[];
  outfits: CalendarOutfit[];
  onClose: () => void;
}

function LogSheet({ date, log, today, weather, pieces, outfits, onClose }: SheetProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [itemIds, setItemIds] = useState<string[]>(log?.item_ids ?? []);
  const [outfitId, setOutfitId] = useState<string | null>(log?.outfit_id ?? null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(log?.photo_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selectable = pieces.filter((p) => p.status === "personal" || itemIds.includes(p.id));

  // A photo uploaded here but never saved shouldn't stay on disk.
  function discardUnsavedPhoto() {
    if (photoUrl && photoUrl !== log?.photo_url) discardUploads([photoUrl]);
  }

  function cancel() {
    discardUnsavedPhoto();
    onClose();
  }

  function pickOutfit(outfit: CalendarOutfit) {
    if (outfitId === outfit.id) {
      setOutfitId(null);
      setItemIds([]);
    } else {
      setOutfitId(outfit.id);
      setItemIds(outfit.outfit_items.map((i) => i.item_id));
    }
  }

  function togglePiece(id: string) {
    // Changing the pieces by hand keeps the outfit link, because wearing an outfit
    // with one piece swapped is still that outfit.
    setItemIds((all) => (all.includes(id) ? all.filter((x) => x !== id) : [...all, id]));
  }

  async function addPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      // Loaded on demand: the calendar shouldn't pay for this until someone adds a photo.
      const { compressPhoto } = await import("@/lib/image-pipeline");
      setPhotoUrl(await uploadPhotoBlob(await compressPhoto(file)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await saveWearLog({
        date,
        outfit_id: outfitId,
        item_ids: itemIds,
        photo_url: photoUrl,
        // Only today's weather is known. A log keeps what it already recorded.
        weather: date === today ? weather : (log?.weather ?? null),
      });
      if (!res.ok) return setError(res.error);
      onClose();
    });
  }

  function remove() {
    if (!log) return;
    setError(null);
    start(async () => {
      const res = await deleteWearLog(log.id);
      if (!res.ok) return setError(res.error);
      onClose();
    });
  }

  const empty = itemIds.length === 0 && !photoUrl;
  const recorded = log?.weather;

  return (
    <Dialog open onOpenChange={(open) => !open && cancel()}>
      <DialogContent className="sheet">
        <DialogHeader className="text-left">
          <DialogTitle>{date === today ? "Today" : shortDate(date)}</DialogTitle>
          <DialogDescription className="num">
            {recorded ? `${recorded.label}, ${recorded.low}° / ${recorded.high}°` : "What did you wear?"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[62dvh] flex-col gap-5 overflow-y-auto">
          <section aria-label="Mirror photo">
            <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { addPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={(e) => { addPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            {photoUrl ? (
              <div className="relative aspect-[3/4] w-40 overflow-hidden rounded-lg bg-muted">
                <img src={photoUrl} alt="Mirror photo" className="size-full object-cover" />
                <button type="button" aria-label="Remove photo" className="absolute top-1 right-1 grid size-9 place-items-center rounded-md bg-background/80 backdrop-blur" onClick={() => { discardUnsavedPhoto(); setPhotoUrl(null); }}>
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" disabled={uploading} onClick={() => cameraRef.current?.click()}>
                  {uploading ? <Loader2 className="animate-spin" /> : <Camera />} Mirror photo
                </Button>
                <Button type="button" variant="outline" disabled={uploading} onClick={() => libraryRef.current?.click()}>
                  <ImagePlus /> From library
                </Button>
              </div>
            )}
          </section>

          {outfits.length > 0 && (
            <section>
              <h3 className="eyebrow mb-2">Outfit</h3>
              <div className="flex flex-wrap gap-1.5">
                {outfits.map((outfit) => (
                  <button key={outfit.id} type="button" className="chip" data-active={outfitId === outfit.id} aria-pressed={outfitId === outfit.id} onClick={() => pickOutfit(outfit)}>
                    {outfit.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="eyebrow mb-2">Pieces</h3>
            {selectable.length === 0 ? (
              <p className="text-sm text-muted-foreground">Mark some items as Personal to log them here.</p>
            ) : (
              <ul className="grid grid-cols-4 gap-1.5">
                {selectable.map((piece) => {
                  const image = primaryImage(piece.item_images);
                  const chosen = itemIds.includes(piece.id);
                  return (
                    <li key={piece.id}>
                      <button type="button" aria-pressed={chosen} aria-label={`${piece.brand} ${piece.name}`} className={cn("block aspect-[3/4] w-full overflow-hidden rounded-md bg-muted", chosen ? "outline-2 -outline-offset-2 outline-foreground" : "opacity-60")} onClick={() => togglePiece(piece.id)}>
                        {image && <img src={image} alt="" loading="lazy" className={`size-full ${imageFitClass(piece.item_images)}`} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {error && <p role="alert" className="text-sm font-medium">{error}</p>}
        <div className={cn("grid gap-2", log && "grid-cols-[auto_1fr]")}>
          {log && <Button type="button" variant="outline" disabled={pending} onClick={remove}>Delete</Button>}
          <Button type="button" disabled={pending || uploading || empty} onClick={save}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface Props {
  month: string;
  today: string;
  logs: WearLog[];
  pieces: CalendarPiece[];
  outfits: CalendarOutfit[];
  weather: Weather | null;
  city: string | null;
  hasLocation: boolean;
}

function Thumb({ log, pieceById, outfitById }: { log: WearLog; pieceById: Map<string, CalendarPiece>; outfitById: Map<string, CalendarOutfit> }) {
  if (log.photo_url) return <img src={log.photo_url} alt="" loading="lazy" className="size-full object-cover" />;
  const outfit = log.outfit_id ? outfitById.get(log.outfit_id) : undefined;
  if (outfit?.mode === "canvas") {
    return <CanvasPreview items={outfit.outfit_items} pieceFor={(id) => pieceById.get(id)} className="size-full" />;
  }
  const first = log.item_ids.map((id) => pieceById.get(id)).find(Boolean);
  const image = primaryImage(first?.item_images);
  if (!image) return null;
  return (
    <>
      <img src={image} alt="" loading="lazy" className={`size-full ${imageFitClass(first?.item_images)}`} />
      {log.item_ids.length > 1 && <span className="num absolute right-0 bottom-0 rounded-tl-sm bg-background/85 px-1 text-[9px] leading-tight text-foreground">+{log.item_ids.length - 1}</span>}
    </>
  );
}

function toIso(d: Date): string {
  return localDate(d);
}

export function CalendarView({ month, today: serverToday, logs, pieces, outfits, weather, city, hasLocation }: Props) {
  const router = useRouter();
  const [openDate, setOpenDate] = useState<string | null>(null);
  const logByDate = useMemo(() => new Map(logs.map((l) => [l.date, l])), [logs]);
  const pieceById = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);
  const outfitById = useMemo(() => new Map(outfits.map((o) => [o.id, o])), [outfits]);
  const today = serverToday;
  const [year, monthNumber] = month.split("-").map(Number);
  const shownMonth = new Date(year, monthNumber - 1, 1);

  // Memoised because React Day Picker renders this for every day, and a new
  // function each render would remount every cell and reload its image.
  const DayButton = useMemo(
    () =>
      function DayButton({ day, modifiers, className, ...rest }: DayButtonProps) {
        const log = logByDate.get(toIso(day.date));
        const name = day.date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
        return (
          <button
            {...rest}
            type="button"
            aria-label={log ? `${name}, logged` : name}
            className={cn(className, "relative block aspect-[3/4] w-full overflow-hidden rounded-md text-left", log ? "bg-muted" : "border border-border/60", modifiers.disabled && "opacity-30")}
          >
            {/* Only the picture dims on neighbouring months, so the day number stays readable. */}
            {log && <span className={cn("block size-full", modifiers.outside && "opacity-40")}><Thumb log={log} pieceById={pieceById} outfitById={outfitById} /></span>}
            <span className={cn("num absolute top-0.5 left-0.5 rounded-sm px-1 text-[10px] leading-tight", modifiers.today ? "bg-foreground font-semibold text-background" : log ? "bg-background/85" : "text-muted-foreground")}>
              {day.date.getDate()}
            </span>
          </button>
        );
      },
    [logByDate, pieceById, outfitById],
  );

  const count = logs.filter((l) => l.date.startsWith(month)).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <h1 className="page-title">Calendar</h1>
        <p className="num text-right text-xs text-muted-foreground">{count} {count === 1 ? "day" : "days"} logged</p>
      </div>

      <WeatherBanner weather={weather} city={city} hasLocation={hasLocation} />

      <DayPicker
        mode="single"
        month={shownMonth}
        onMonthChange={(m) => router.push(`/calendar?month=${toIso(m).slice(0, 7)}`)}
        onDayClick={(d) => setOpenDate(toIso(d))}
        weekStartsOn={1}
        showOutsideDays
        fixedWeeks
        disabled={{ after: new Date(`${today}T23:59:59`) }}
        endMonth={new Date(`${today.slice(0, 7)}-01T00:00:00`)}
        components={{ DayButton }}
        classNames={{
          root: "w-full",
          months: "w-full",
          month: "w-full",
          nav: "flex items-center justify-between",
          button_previous: "grid size-11 place-items-center aria-disabled:opacity-30",
          button_next: "grid size-11 place-items-center aria-disabled:opacity-30",
          chevron: "size-5 fill-foreground",
          month_caption: "absolute inset-x-12 -mt-9 text-center text-sm font-semibold tracking-tight uppercase",
          caption_label: "inline",
          month_grid: "mt-1 w-full table-fixed border-separate border-spacing-0.5",
          weekday: "eyebrow pb-1 text-center font-semibold",
          day: "p-0 align-top",
        }}
      />

      <button
        type="button"
        aria-label="Log today's outfit"
        className="fab fixed right-4 z-20 inline-flex h-14 items-center gap-2 rounded-full bg-foreground pr-5 pl-4 text-sm font-medium text-background shadow-lg md:bottom-8"
        onClick={() => setOpenDate(today)}
      >
        <Plus className="size-5" /> Log
      </button>

      {openDate && (
        <LogSheet
          key={openDate}
          date={openDate}
          log={logByDate.get(openDate)}
          today={today}
          weather={weather}
          pieces={pieces}
          outfits={outfits}
          onClose={() => setOpenDate(null)}
        />
      )}
    </div>
  );
}
