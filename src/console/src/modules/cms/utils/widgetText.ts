import type { WidgetConfig, WidgetType } from "../components/widgetCatalog";

/**
 * Which parts of a widget's config are prose, and so worth a second language.
 *
 * Named rather than discovered. Walking the config for every string would also
 * offer a category slug, a sort mode and a layout width — translating any of
 * those breaks the block instead of localising it, and a filter that quietly
 * stops matching is the kind of bug nobody traces back to a translation form.
 *
 * `*` stands for one array index, so a CTA's buttons are covered however many
 * there are.
 */
type Field = { pattern: string; label: string; long?: true };

const TRANSLATABLE: Record<WidgetType, Field[]> = {
  product_grid: [{ pattern: "title", label: "heading" }],
  articles_list: [{ pattern: "title", label: "heading" }],
  categories_showcase: [{ pattern: "title", label: "heading" }],
  rich_text: [{ pattern: "html", label: "html", long: true }],
  // A button's href is here on purpose: the site's chrome already declares
  // header_cta_url translatable, because the page a reader should land on can
  // differ by language.
  cta_banner: [
    { pattern: "heading", label: "heading" },
    { pattern: "sub", label: "sub", long: true },
    { pattern: "buttons.*.label", label: "button_label" },
    { pattern: "buttons.*.href", label: "button_href" },
  ],
};

/** One box on the translation tab: where the text lives and what it says now. */
export interface TextField {
  path: string[];
  original: string;
  /** The same i18n key the base form labels this field with. */
  labelKey: string;
  /** True where the base form uses a textarea, so the pair match. */
  long: boolean;
}

export function readAt(source: unknown, path: string[]): string {
  let current: unknown = source;
  for (const step of path) {
    if (current === null || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[step];
  }
  return typeof current === "string" ? current : "";
}

/**
 * Writes one value into a copy of `source`, creating the objects and arrays on
 * the way: the translation is stored in the shape of the config it overlays,
 * which is what the server merges onto, field by field.
 */
export function writeAt(
  source: unknown,
  path: string[],
  value: string,
): unknown {
  const [head, ...rest] = path;
  const intoArray = /^\d+$/.test(head);
  const base: Record<string, unknown> | unknown[] = intoArray
    ? Array.isArray(source)
      ? [...(source as unknown[])]
      : []
    : source && typeof source === "object" && !Array.isArray(source)
      ? { ...(source as Record<string, unknown>) }
      : {};
  const next = rest.length
    ? writeAt((base as Record<string, unknown>)[head], rest, value)
    : value;
  if (Array.isArray(base)) base[Number(head)] = next;
  else (base as Record<string, unknown>)[head] = next;
  return base;
}

/**
 * Expands one pattern against the config: `*` becomes every index present, and
 * index 0 when the list is empty — a button nobody has written yet still has a
 * label, and a box that appears only after the Vietnamese is typed is a box
 * nobody finds.
 */
function expand(config: WidgetConfig, pattern: string): string[][] {
  let paths: string[][] = [[]];
  for (const step of pattern.split(".")) {
    paths = paths.flatMap((path) => {
      if (step !== "*") return [[...path, step]];
      let node: unknown = config;
      for (const s of path) {
        if (node === null || typeof node !== "object") return [];
        node = (node as Record<string, unknown>)[s];
      }
      return Array.isArray(node) && node.length > 0
        ? node.map((_, i) => [...path, String(i)])
        : [[...path, "0"]];
    });
  }
  return paths;
}

/**
 * The text boxes a block offers, in config order — every one of them, whether
 * or not the source language has been written yet. The form is the same shape
 * each time it is opened, which is the whole reason the boxes sit in it.
 */
export function textFields(
  type: WidgetType | null,
  config: WidgetConfig,
): TextField[] {
  if (!type) return [];
  return (TRANSLATABLE[type] ?? []).flatMap(({ pattern, label, long }) =>
    expand(config, pattern).map((path) => ({
      path,
      original: readAt(config, path),
      labelKey: `cms.pages.widget.${type}.${label}`,
      long: long === true,
    })),
  );
}
