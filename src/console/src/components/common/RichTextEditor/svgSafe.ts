// The same drawing vocabulary the server keeps — see
// backend/internal/platform/htmlsan/svg.go, which is the one that actually
// decides what gets stored. This copy exists so the editor shows what will
// survive instead of a preview that looks right until it is saved, and so a
// drawing pasted from elsewhere cannot run anything in the admin's own browser
// on its way through.
//
// The two lists have to be changed together. If they drift, the test
// svgSafe.test.ts fails on the shape the server would have dropped.

const ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "defs",
  "marker",
  "lineargradient",
  "radialgradient",
  "stop",
  "title",
  "desc",
]);

const ATTRS = new Set([
  "id", "transform", "opacity",
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width",
  "stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
  "stroke-dashoffset", "stroke-miterlimit",
  "marker-start", "marker-mid", "marker-end",
  "font-family", "font-size", "font-weight", "font-style", "letter-spacing",
  "text-anchor", "dominant-baseline", "alignment-baseline",
  "role", "aria-label", "aria-hidden",
  "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "width", "height", "d", "points", "dx", "dy", "offset",
  "viewbox", "preserveaspectratio", "xmlns",
  "stop-color", "stop-opacity", "gradientunits", "gradienttransform",
  "markerwidth", "markerheight", "refx", "refy", "orient", "markerunits",
]);

/**
 * Strips a drawing down to what the server will store.
 *
 * Returns "" when there is no usable <svg> in the input — the caller treats
 * that as "nothing to insert" rather than inserting an empty box.
 */
export function sanitizeSvg(code: string): string {
  const parsed = new DOMParser().parseFromString(
    `<div>${code}</div>`,
    "text/html",
  );
  const svg = parsed.body.querySelector("svg");
  if (!svg) return "";
  clean(svg);
  return svg.outerHTML;
}

function clean(el: Element) {
  for (const child of [...el.children]) {
    if (!ELEMENTS.has(child.tagName.toLowerCase())) {
      // Removed whole, not unwrapped: the contents of a <script> or a
      // <foreignObject> are not drawing, and keeping them as text would put
      // the code back into the page as visible characters.
      child.remove();
      continue;
    }
    clean(child);
  }
  for (const name of el.getAttributeNames()) {
    if (!ATTRS.has(name.toLowerCase())) el.removeAttribute(name);
  }
}

/** The text nodes a reader sees, in the order the drawing declares them. */
export function svgLabels(svg: Element): SVGElement[] {
  return [...svg.querySelectorAll<SVGElement>("text, tspan")].filter(
    (el) => el.querySelector("tspan") === null,
  );
}
