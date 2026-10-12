import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudFog,
  CloudMoon,
  CloudRain,
  CloudSun,
  CloudLightning,
  CloudSnow,
  CloudDrizzle,
  Droplets,
  LocateFixed,
  MapPin,
  Moon,
  RotateCcw,
  Sun,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import {
  calendarDays,
  dateFromKey,
  lunarDate,
  shiftMonth,
  VIETNAM_TIMEZONE,
  vietnamDateKey,
} from "./calendar";
import {
  getWeather,
  weatherCities,
  weatherCondition,
  type WeatherLocation,
} from "./weather.service";

const CITY_STORAGE = "zukatek.dashboard.weather.city";
const conditionIcons: Record<string, LucideIcon> = {
  clear: Sun,
  partly_cloudy: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
  unknown: Cloud,
};

function WeatherIcon({
  code,
  night = false,
  className = "size-6",
}: {
  code: number | null;
  night?: boolean;
  className?: string;
}) {
  const condition = weatherCondition(code);
  const Icon =
    night && condition === "clear"
      ? Moon
      : night && condition === "partly_cloudy"
        ? CloudMoon
        : conditionIcons[condition];
  return (
    <Icon
      data-condition={condition}
      className={`dashboard-weather-icon ${className}`}
      strokeWidth={1.5}
      aria-hidden
    />
  );
}

function CalendarPanel({ today }: { today: string }) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const dateKey = selected ?? today;
  const monthKey = month ?? today.slice(0, 7);
  const lunar = lunarDate(dateKey);
  const locale = i18n.resolvedLanguage || "vi";
  const format = (key: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: VIETNAM_TIMEZONE,
    }).format(dateFromKey(key));
  return (
    <section
      className="dashboard-panel dashboard-calendar rounded-lg border bg-background p-5"
      aria-label={t("dashboard.daily.calendar_title")}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="size-4 text-primary" aria-hidden />
          {t("dashboard.daily.calendar_title")}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelected(null);
            setMonth(null);
          }}
        >
          {t("dashboard.daily.today")}
        </Button>
      </div>
      <div className="dashboard-calendar-summary mt-4 flex items-center gap-4 rounded-lg bg-primary/5 p-4">
        <span className="text-4xl font-semibold tabular-nums text-primary">
          {Number(dateKey.slice(-2))}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold capitalize">
            {format(dateKey, { weekday: "long" })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {format(dateKey, { month: "long", year: "numeric" })}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-primary">
            <Moon className="size-3" aria-hidden />
            {t("dashboard.daily.lunar_date", {
              day: lunar.day,
              month: lunar.month,
              year: lunar.year,
            })}
            {lunar.leap && ` ${t("dashboard.daily.leap")}`}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("dashboard.daily.lunar_year", { name: lunar.yearName })}
          </p>
        </div>
      </div>
      <div className="my-3 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("dashboard.daily.previous_month")}
          disabled={monthKey <= "1900-01"}
          onClick={() => setMonth(shiftMonth(monthKey, -1))}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <p aria-live="polite" className="text-xs font-semibold capitalize">
          {format(`${monthKey}-01`, { month: "long", year: "numeric" })}
        </p>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("dashboard.daily.next_month")}
          disabled={monthKey >= "2099-12"}
          onClick={() => setMonth(shiftMonth(monthKey, 1))}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {Array.from({ length: 7 }, (_, index) => (
          <span
            key={index}
            className="pb-2 text-[10px] font-medium text-muted-foreground"
          >
            {format(`2026-01-${String(5 + index).padStart(2, "0")}`, {
              weekday: "short",
            })}
          </span>
        ))}
        {calendarDays(monthKey).map((day) => (
          <button
            key={day.key}
            type="button"
            aria-pressed={dateKey === day.key}
            aria-current={day.key === today ? "date" : undefined}
            aria-label={t("dashboard.daily.select_date", {
              solar: format(day.key, {
                day: "numeric",
                month: "long",
                year: "numeric",
              }),
              lunar: `${day.lunar.day}/${day.lunar.month}${day.lunar.leap ? ` ${t("dashboard.daily.leap")}` : ""}`,
            })}
            className={`dashboard-calendar-day ${day.inMonth ? "" : "dashboard-calendar-day-outside"}`}
            onClick={() => {
              setSelected(day.key);
              if (!day.inMonth) setMonth(day.key.slice(0, 7));
            }}
          >
            <span className="text-xs font-medium tabular-nums">{day.day}</span>
            <span
              className={`text-[9px] tabular-nums ${day.lunar.day === 1 ? "text-primary" : "text-muted-foreground"}`}
            >
              {day.lunar.day === 1
                ? `${day.lunar.day}/${day.lunar.month}`
                : day.lunar.day}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-[10px] text-muted-foreground">
        {t("dashboard.daily.calendar_hint")}
      </p>
    </section>
  );
}

const number = (value: number | null | undefined, suffix: string) =>
  value == null ? "—" : `${Math.round(value)}${suffix}`;

function WeatherPanel({ today }: { today: string }) {
  const { t, i18n } = useTranslation();
  const [location, setLocation] = useState<WeatherLocation>(() => {
    try {
      return (
        weatherCities.find(
          (city) => city.id === localStorage.getItem(CITY_STORAGE),
        ) ?? weatherCities[0]
      );
    } catch {
      return weatherCities[0];
    }
  });
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const query = useQuery({
    queryKey: [
      "dashboard",
      "weather",
      location.latitude,
      location.longitude,
      today,
    ],
    queryFn: ({ signal }) => getWeather(location, signal),
    staleTime: 10 * 60_000,
    refetchInterval: 15 * 60_000,
    retry: 1,
  });
  const weather = query.data;
  const locale = i18n.resolvedLanguage || "vi";
  const format = (key: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: VIETNAM_TIMEZONE,
    }).format(dateFromKey(key));
  function selectCity(id: string) {
    const city = weatherCities.find((item) => item.id === id);
    if (!city) return;
    setLocation(city);
    setLocationError(false);
    try {
      localStorage.setItem(CITY_STORAGE, id);
    } catch {
      /* Selection still works without persistence. */
    }
  }
  function locate() {
    setLocationError(false);
    if (!navigator.geolocation) {
      setLocationError(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({
          id: "current",
          name: t("dashboard.daily.current_location"),
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocationError(true);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }
  return (
    <section
      className="dashboard-panel dashboard-weather min-w-0 rounded-lg border bg-background p-5"
      aria-label={t("dashboard.daily.weather_title")}
    >
      <div className="dashboard-weather-heading flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CloudSun className="size-4 text-primary" aria-hidden />
          {t("dashboard.daily.weather_title")}
        </h3>
        <div className="flex min-w-0 items-center gap-2">
          <Select
            aria-label={t("dashboard.daily.choose_location")}
            className="w-40 text-xs"
            value={location.id}
            onChange={(event) => selectCity(event.target.value)}
          >
            {weatherCities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
            {location.id === "current" && (
              <option value="current">
                {t("dashboard.daily.current_location")}
              </option>
            )}
          </Select>
          <Button
            variant="outline"
            size="icon"
            disabled={locating}
            aria-label={t("dashboard.daily.use_location")}
            title={t("dashboard.daily.use_location")}
            onClick={locate}
          >
            <LocateFixed
              className={
                locating ? "animate-pulse motion-reduce:animate-none" : ""
              }
              aria-hidden
            />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={query.isFetching}
            aria-label={t("dashboard.daily.refresh_weather")}
            title={t("dashboard.daily.refresh_weather")}
            onClick={() => void query.refetch()}
          >
            <RotateCcw
              className={
                query.isFetching
                  ? "animate-spin motion-reduce:animate-none"
                  : ""
              }
              aria-hidden
            />
          </Button>
        </div>
      </div>
      {locationError && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {t("dashboard.daily.location_error")}
        </p>
      )}
      {query.isPending ? (
        <div className="mt-5 space-y-5" aria-label={t("common.loading")}>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : !weather ? (
        <div className="flex min-h-80 flex-col items-center justify-center gap-4 text-center">
          <Cloud
            className="size-10 text-muted-foreground"
            strokeWidth={1.2}
            aria-hidden
          />
          <p role="alert" className="max-w-xs text-sm text-muted-foreground">
            {t("dashboard.daily.weather_error")}
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : (
        <>
          <div className="dashboard-weather-current mt-5 rounded-lg bg-primary/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <MapPin className="size-3.5 text-primary" aria-hidden />
                  {location.id === "current"
                    ? t("dashboard.daily.current_location")
                    : location.name}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("dashboard.daily.today")} ·{" "}
                  {format(weather.daily.time[0], {
                    day: "numeric",
                    month: "long",
                  })}
                </p>
              </div>
              <span className="rounded-md bg-background/70 px-2 py-1 text-[10px] text-muted-foreground">
                {t("dashboard.daily.current")}
              </span>
            </div>
            <div className="dashboard-weather-temperature my-5 flex items-center gap-5">
              <WeatherIcon
                code={weather.current.weather_code}
                night={!weather.current.is_day}
                className="size-14 shrink-0"
              />
              <div>
                <p className="text-4xl font-semibold tabular-nums tracking-tight">
                  {number(weather.current.temperature_2m, "°")}
                  <span className="ml-1 text-xl font-normal text-muted-foreground">
                    C
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(
                    `dashboard.daily.conditions.${weatherCondition(weather.current.weather_code)}`,
                  )}
                </p>
              </div>
              <p className="dashboard-weather-range ml-auto text-right text-xs leading-6 text-muted-foreground">
                <span className="block">
                  {t("dashboard.daily.high")}{" "}
                  <strong className="font-medium text-foreground">
                    {number(weather.daily.temperature_2m_max[0], "°")}
                  </strong>
                </span>
                <span className="block">
                  {t("dashboard.daily.low")}{" "}
                  <strong className="font-medium text-foreground">
                    {number(weather.daily.temperature_2m_min[0], "°")}
                  </strong>
                </span>
              </p>
            </div>
            <div className="dashboard-weather-details grid grid-cols-3 gap-3 border-t border-primary/10 pt-4 text-xs">
              <div>
                <p className="text-[10px] text-muted-foreground">
                  {t("dashboard.daily.feels_like")}
                </p>
                <p className="mt-1.5 font-medium">
                  {number(weather.current.apparent_temperature, "°C")}
                </p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Droplets className="size-3" aria-hidden />
                  {t("dashboard.daily.humidity")}
                </p>
                <p className="mt-1.5 font-medium">
                  {number(weather.current.relative_humidity_2m, "%")}
                </p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Wind className="size-3" aria-hidden />
                  {t("dashboard.daily.wind")}
                </p>
                <p className="mt-1.5 font-medium">
                  {number(weather.current.wind_speed_10m, " km/h")}
                </p>
              </div>
            </div>
          </div>
          <h4 className="mb-3 mt-5 text-xs font-semibold">
            {t("dashboard.daily.next_seven")}
          </h4>
          <div className="dashboard-weather-forecast">
            {weather.daily.time.slice(1, 8).map((date, index) => {
              const i = index + 1;
              const condition = t(
                `dashboard.daily.conditions.${weatherCondition(weather.daily.weather_code[i])}`,
              );
              return (
                <div
                  key={date}
                  className="dashboard-weather-day rounded-lg border px-2 py-3 text-center"
                  title={condition}
                >
                  <p className="text-[11px] font-medium capitalize">
                    {format(date, { weekday: "short" })}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {format(date, { day: "2-digit", month: "2-digit" })}
                  </p>
                  <div className="my-3 flex justify-center">
                    <WeatherIcon code={weather.daily.weather_code[i]} />
                  </div>
                  <span className="sr-only">{condition}</span>
                  <p className="whitespace-nowrap text-xs tabular-nums">
                    <strong className="font-semibold">
                      {number(weather.daily.temperature_2m_max[i], "°")}
                    </strong>{" "}
                    <span className="text-muted-foreground">
                      {number(weather.daily.temperature_2m_min[i], "°")}
                    </span>
                  </p>
                  <p
                    className="mt-2 flex items-center justify-center gap-1 text-[10px] text-muted-foreground"
                    aria-label={t("dashboard.daily.rain_chance", {
                      value: number(
                        weather.daily.precipitation_probability_max[i],
                        "%",
                      ),
                    })}
                  >
                    <Droplets className="size-3 text-primary" aria-hidden />
                    {number(
                      weather.daily.precipitation_probability_max[i],
                      "%",
                    )}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <a
              href="https://open-meteo.com/"
              target="_blank"
              rel="noreferrer"
              className="hover:text-primary hover:underline"
            >
              {t("dashboard.daily.source")}
            </a>
            <span>
              {t("dashboard.daily.updated_at", {
                time: weather.current.time.slice(11, 16),
              })}
            </span>
          </div>
          {query.isError && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {t("dashboard.daily.stale_weather")}
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function DailyOverview() {
  const { t } = useTranslation();
  const [today, setToday] = useState(() => vietnamDateKey());
  useEffect(() => {
    const interval = window.setInterval(
      () => setToday(vietnamDateKey()),
      60_000,
    );
    return () => window.clearInterval(interval);
  }, []);
  return (
    <section className="space-y-3" aria-labelledby="dashboard-daily-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="dashboard-daily-title" className="text-base font-semibold">
          {t("dashboard.daily.title")}
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {t("dashboard.daily.timezone")}
        </span>
      </div>
      <div className="dashboard-daily-grid">
        <CalendarPanel today={today} />
        <WeatherPanel today={today} />
      </div>
    </section>
  );
}
