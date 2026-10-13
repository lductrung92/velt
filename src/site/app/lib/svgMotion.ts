// Trigonometric results can differ by a few ULPs between Node and browsers.
// Stable precision keeps decorative SVG attributes identical during hydration.
export const svgPrecision = (value: number) => Math.round(value * 1e6) / 1e6;
export const svgSin = (angle: number) => svgPrecision(Math.sin(angle));
export const svgCos = (angle: number) => svgPrecision(Math.cos(angle));
