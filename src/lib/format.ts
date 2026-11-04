const chfFormatter = new Intl.NumberFormat("de-CH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const wholeFormatter = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });

/** 1234.5 -> "1’234.50" */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return chfFormatter.format(Number(value));
}

/** 1234.5 -> "1’235". For large display figures where cents are noise. */
export function moneyWhole(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return wholeFormatter.format(Number(value));
}

/** Always shows a sign: +120.00 or -35.00 */
export function signedMoney(value: number): string {
  return `${value >= 0 ? "+" : "−"}${money(Math.abs(value))}`;
}

export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Today's date in the device's own time zone, as YYYY-MM-DD. */
export function localDate(d: Date = new Date()): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function shortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** Whole days from a to b. Accepts dates or timestamps; compares calendar days. */
export function daysBetween(a: string, b: string): number {
  const start = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

export function primaryImage(images: { url: string; is_primary: boolean; position: number }[] | undefined): string | null {
  if (!images || images.length === 0) return null;
  const primary = images.find((i) => i.is_primary);
  if (primary) return primary.url;
  return [...images].sort((a, b) => a.position - b.position)[0].url;
}

/** The user's own brands, most used first. Spelling variants merge by case. */
export function rankBrands(rows: { brand: string }[]): string[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const { brand } of rows) {
    const key = brand.trim().toLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { name: brand.trim(), count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).map((e) => e.name);
}

type DisplayImage = { url: string; is_primary: boolean; position: number; cutout_url?: string | null };

/** Cutouts sit whole on a light studio gray, so black garments stay visible in dark mode. Photos fill the frame. */
export function imageFitClass(images: DisplayImage[] | undefined): string {
  const url = primaryImage(images);
  const image = images?.find((i) => i.url === url);
  return image?.cutout_url && image.cutout_url === url ? "cutout" : "object-cover";
}
