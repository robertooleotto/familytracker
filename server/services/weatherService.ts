/**
 * Weather service — checks forecast for family locations.
 * Uses Open-Meteo API (free, no key needed).
 */

export interface DayForecast {
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipitationProbability: number;
  description: string;
}

const WEATHER_DESCRIPTIONS: Record<number, string> = {
  0: "sereno", 1: "prevalentemente sereno", 2: "parzialmente nuvoloso", 3: "coperto",
  45: "nebbia", 48: "nebbia con brina",
  51: "pioggerella leggera", 53: "pioggerella", 55: "pioggerella intensa",
  61: "pioggia leggera", 63: "pioggia moderata", 65: "pioggia intensa",
  71: "neve leggera", 73: "neve moderata", 75: "neve intensa",
  80: "rovesci leggeri", 81: "rovesci", 82: "rovesci intensi",
  85: "neve a rovesci", 86: "neve intensa a rovesci",
  95: "temporale", 96: "temporale con grandine leggera", 99: "temporale con grandine",
};

const BAD_WEATHER_CODES = new Set([51, 53, 55, 61, 63, 65, 71, 73, 75, 80, 81, 82, 85, 86, 95, 96, 99]);

export function isBadWeather(code: number): boolean {
  return BAD_WEATHER_CODES.has(code);
}

export function getWeatherDescription(code: number): string {
  return WEATHER_DESCRIPTIONS[code] || "condizioni variabili";
}

export async function getForecast(lat: number, lng: number, days: number = 3): Promise<DayForecast[]> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe/Rome&forecast_days=${days}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json() as any;

    const daily = data.daily;
    if (!daily?.time) return [];

    return daily.time.map((date: string, i: number) => ({
      date,
      weatherCode: daily.weather_code[i],
      tempMax: daily.temperature_2m_max[i],
      tempMin: daily.temperature_2m_min[i],
      precipitationProbability: daily.precipitation_probability_max?.[i] ?? 0,
      description: getWeatherDescription(daily.weather_code[i]),
    }));
  } catch (err) {
    console.warn("[Weather] Forecast error:", (err as Error).message);
    return [];
  }
}

/**
 * Check if an outdoor event is at risk due to weather.
 */
export function isOutdoorEvent(title: string, category?: string | null, locationName?: string | null): boolean {
  const text = `${title} ${category || ""} ${locationName || ""}`.toLowerCase();
  const outdoorKeywords = [
    "gita", "parco", "piscina", "calcio", "tennis", "basket", "corsa", "jogging",
    "bici", "ciclismo", "escursione", "trekking", "mare", "spiaggia", "lago",
    "pic", "nic", "picnic", "bbq", "barbecue", "campeggio", "festa all'aperto",
    "giardino", "atletica", "stadio", "campo", "outdoor", "passeggiata",
    "rugby", "pallavolo", "beach", "surf", "vela", "canoa", "kayak",
  ];
  return outdoorKeywords.some(kw => text.includes(kw));
}
