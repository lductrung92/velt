import i18n from "@/app/i18n";

// Shared date shape across the console: "12 thg 10, 2026" in Vietnamese.
const DATE_PARTS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

// Locale-aware date formatting. Returns "" for null/invalid so callers can
// render their own placeholder. The locale comes from the i18n instance rather
// than the browser, so a Vietnamese console never prints US-style dates; every
// caller renders inside a component subscribed to t(), so switching language
// re-renders and reformats.
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : new Intl.DateTimeFormat(i18n.language, DATE_PARTS).format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : new Intl.DateTimeFormat(i18n.language, {
        ...DATE_PARTS,
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
}
