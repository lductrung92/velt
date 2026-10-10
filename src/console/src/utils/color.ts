/**
 * Convert a `#RRGGBB` hex string to the shadcn CSS-variable HSL triplet
 * `"H S% L%"` (no `hsl(...)` wrapper). The theme defines `--primary` / `--ring`
 * in this space-separated HSL form (see console/src/index.css), so the result
 * can be assigned directly via `style.setProperty`.
 *
 * Returns `null` for malformed input so callers can skip applying a bad value
 * rather than writing an invalid CSS variable.
 */
export function hexToHslTriplet(hex: string): string | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;

  const int = parseInt(match[1], 16);
  const r = ((int >> 16) & 0xff) / 255;
  const g = ((int >> 8) & 0xff) / 255;
  const b = (int & 0xff) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case r:
        h = (g - b) / delta + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      default:
        h = (r - g) / delta + 4;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
