import { useTranslation } from "react-i18next";

import { Label } from "@/components/ui/label";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";

/**
 * A landing section in another language.
 *
 * A section has no fixed set of text fields — a hero has a heading, an FAQ has
 * a list of questions, and the catalogue has nineteen types — so the boxes are
 * built from the section's OWN config: every string in it becomes a box, in the
 * order it appears. That is why there is no per-type form here and no second
 * place to update when a section type gains a field.
 *
 * What is not a string is not shown: limits, ids, flags and media paths are the
 * same page in every language. A box left empty keeps the published text, which
 * is what the site serves.
 */
export interface TextNode {
  /** Where the value lives in the config, e.g. ["items", "0", "question"]. */
  path: string[];
  original: string;
}

/**
 * Keys whose value is a string but not TEXT.
 *
 * A config mixes prose with machinery: `align: "left"`, `style: "primary"`,
 * `image_path: "cms/…"`, `category_id: "…"`. All of them are strings, so a
 * plain walk offered a translation box for each — asking somebody to translate
 * the word "left". Prose is what is left once these are out.
 */
const NOT_TEXT = new Set([
  "align",
  "background",
  "category",
  "columns",
  "key",
  "limit",
  "media_side",
  "style",
  "tag",
  "width",
]);

function isText(key: string | undefined): boolean {
  if (!key) return true;
  if (/^[0-9]+$/.test(key)) return true; // an index carries its parent's kind
  return !NOT_TEXT.has(key) && !key.endsWith("_path") && !key.endsWith("_id");
}

/** Every translatable string in the published config, in document order. */
export function collectText(value: unknown, path: string[] = []): TextNode[] {
  if (typeof value === "string") {
    if (!isText(path[path.length - 1])) return [];
    return value.trim() ? [{ path, original: value }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => collectText(item, [...path, String(i)]));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, child]) => collectText(child, [...path, key]),
    );
  }
  return [];
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
 * the way. The shape mirrors the published config, because that is what the
 * server merges it onto, field by field.
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
 * What to call a box, in the words the original form uses.
 *
 * The boxes used to carry no label at all — only the published text as a
 * placeholder — so a column of them said nothing about WHICH field each one
 * was, and one that had already been translated said nothing at all. The label
 * is read from the same `cms.landings.form.*` vocabulary the left-hand form
 * labels itself with, so both sides name a field identically.
 *
 * A repeated item carries its position: "Nhãn nút 2" is the second button.
 */
export function fieldLabel(
  path: string[],
  translate: (key: string, fallback: string) => string,
): string {
  const key = path[path.length - 1] ?? "";
  const label = translate(`cms.landings.form.${key}`, key);
  const index = [...path].reverse().find((step) => /^[0-9]+$/.test(step));
  return index === undefined ? label : `${label} ${Number(index) + 1}`;
}

/** One labelled box per translatable string in `config`, filled from `draft`. */
export function ConfigTranslationFields({
  nodes,
  draft,
  onChange,
}: {
  nodes: TextNode[];
  draft: unknown;
  onChange: (next: unknown) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      {nodes.map((node) => {
        const id = `tr-${node.path.join("-")}`;
        const long =
          node.original.length > 70 || node.original.includes("\n");
        const set = (next: string) => onChange(writeAt(draft, node.path, next));
        const label = fieldLabel(node.path, (key, fallback) =>
          t(key, { defaultValue: fallback }),
        );
        // The published text is the placeholder: an empty box means "keep it",
        // which is exactly what the site does.
        return (
          <div key={id} className="space-y-1.5">
            <Label htmlFor={id} className="text-xs font-medium">
              {label}
            </Label>
            {long ? (
              <Textarea
                id={id}
                rows={3}
                value={readAt(draft, node.path)}
                placeholder={node.original}
                onChange={(e) => set(e.target.value)}
              />
            ) : (
              <TextField
                id={id}
                value={readAt(draft, node.path)}
                placeholder={node.original}
                onChange={(e) => set(e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
