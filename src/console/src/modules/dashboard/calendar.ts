import { SolarDate } from "lunar-date-vn";

export const VIETNAM_TIMEZONE = "Asia/Ho_Chi_Minh";

export function vietnamDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function dateFromKey(key: string): Date {
  return new Date(`${key}T12:00:00+07:00`);
}

export function lunarDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  const lunar = new SolarDate({ year, month, day, yearIndex: year, hour: 12 })
    .toLunarDate()
    ?.get();
  if (!lunar)
    throw new RangeError("Date outside Vietnamese lunar calendar range");
  return {
    day: lunar.day,
    month: lunar.month,
    year: lunar.year,
    leap: lunar.leap_month ?? false,
    yearName: lunar.year_name,
  };
}

export function calendarDays(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, 1 - mondayOffset + index));
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      day: date.getUTCDate(),
      inMonth: key.startsWith(monthKey),
      lunar: lunarDate(key),
    };
  });
}

export function shiftMonth(monthKey: string, direction: number) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + direction, 1))
    .toISOString()
    .slice(0, 7);
}
