import { z } from "zod";

import { VIETNAM_TIMEZONE } from "./calendar";

export const WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
export const weatherCities = [
  { id: "da-nang", name: "Đà Nẵng", latitude: 16.0678, longitude: 108.2208 },
  { id: "ha-noi", name: "Hà Nội", latitude: 21.0245, longitude: 105.8412 },
  {
    id: "ho-chi-minh",
    name: "TP. Hồ Chí Minh",
    latitude: 10.823,
    longitude: 106.6296,
  },
];
export type WeatherLocation = (typeof weatherCities)[number];

const values = z.array(z.number().nullable()).min(8);
const forecastSchema = z.object({
  current: z.object({
    time: z.string(),
    temperature_2m: z.number().nullable(),
    apparent_temperature: z.number().nullable(),
    relative_humidity_2m: z.number().nullable(),
    wind_speed_10m: z.number().nullable(),
    weather_code: z.number().nullable(),
    is_day: z.number(),
  }),
  daily: z.object({
    time: z.array(z.string()).min(8),
    weather_code: values,
    temperature_2m_max: values,
    temperature_2m_min: values,
    precipitation_probability_max: values,
  }),
});
export type WeatherForecast = z.infer<typeof forecastSchema>;

export async function getWeather(
  location: WeatherLocation,
  signal?: AbortSignal,
): Promise<WeatherForecast> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: VIETNAM_TIMEZONE,
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    forecast_days: "8",
    wind_speed_unit: "kmh",
    temperature_unit: "celsius",
  });
  const timeout = AbortSignal.timeout(15_000);
  const response = await fetch(`${WEATHER_ENDPOINT}?${params}`, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok)
    throw new Error(`Weather request failed: ${response.status}`);
  return forecastSchema.parse(await response.json());
}

export function weatherCondition(code: number | null): string {
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partly_cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ([51, 53, 55, 56, 57].includes(code ?? -1)) return "drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code ?? -1)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code ?? -1)) return "snow";
  if ([95, 96, 97, 99].includes(code ?? -1)) return "storm";
  return "unknown";
}
