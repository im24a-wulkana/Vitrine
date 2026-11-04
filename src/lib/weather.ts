// Weather from Open-Meteo, which needs no API key. Requests come from the server,
// and only ever send coordinates or a city name.

export interface Weather {
  temp: number;
  high: number;
  low: number;
  code: number;
  label: string;
}

export type WeatherKind = "clear" | "cloud" | "fog" | "rain" | "snow" | "storm";

/** Groups WMO weather codes. Unknown codes count as cloud, the least misleading guess. */
export function weatherKind(code: number): WeatherKind {
  if (code <= 1) return "clear";
  if (code <= 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  return "cloud";
}

const LABELS: Record<WeatherKind, string> = {
  clear: "Clear",
  cloud: "Cloudy",
  fog: "Fog",
  rain: "Rain",
  snow: "Snow",
  storm: "Thunderstorm",
};

export function weatherLabel(code: number): string {
  return code === 1 ? "Mostly clear" : code === 2 ? "Partly cloudy" : LABELS[weatherKind(code)];
}

/** Returns null on any failure. A missing banner must never break the calendar. */
export async function getWeather(lat: number, lon: number): Promise<Weather | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,weather_code",
    daily: "temperature_2m_max,temperature_2m_min",
    timezone: "auto",
    forecast_days: "1",
  });
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const code = body?.current?.weather_code;
    const temp = body?.current?.temperature_2m;
    if (typeof code !== "number" || typeof temp !== "number") return null;
    return {
      temp: Math.round(temp),
      high: Math.round(body.daily.temperature_2m_max[0]),
      low: Math.round(body.daily.temperature_2m_min[0]),
      code,
      label: weatherLabel(code),
    };
  } catch {
    return null;
  }
}

export interface Place {
  city: string;
  lat: number;
  lon: number;
}

export async function findCity(name: string): Promise<Place | null> {
  const params = new URLSearchParams({ name, count: "1", format: "json" });
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const result = (await res.json())?.results?.[0];
    if (!result || typeof result.latitude !== "number" || typeof result.longitude !== "number") return null;
    return { city: String(result.name), lat: result.latitude, lon: result.longitude };
  } catch {
    return null;
  }
}
