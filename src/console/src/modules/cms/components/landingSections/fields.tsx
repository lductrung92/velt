import { Plus, X } from "lucide-react";
import { lazy, Suspense, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  ImageUpload,
  type ImageUploadValue,
} from "@/components/common/ImageHandler";
import { Select } from "@/components/common/Select/Select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import { TargetPicker } from "../TargetPicker";
import { WidgetSelect } from "../WidgetSelect";
import { useTagOptions } from "../../hooks/useCmsTags";
import type { SectionConfig } from "../../services/landing.service";

// Shared props every section config form receives. landingId is needed to upload
// media into the landing's storage prefix.
export interface SectionFormProps {
  value: SectionConfig;
  onChange: (next: SectionConfig) => void;
  landingId: string;
}

const RichTextEditor = lazy(() =>
  import("@/components/common/RichTextEditor").then((m) => ({
    default: m.RichTextEditor,
  })),
);

// setter builds a "set one key" helper over a config object.
export function setter(
  value: SectionConfig,
  onChange: (v: SectionConfig) => void,
) {
  return (k: string, v: unknown) => {
    const next = { ...value };
    if (v === undefined || v === "") delete next[k];
    else next[k] = v;
    onChange(next);
  };
}

function str(cfg: SectionConfig, k: string): string {
  return typeof cfg[k] === "string" ? (cfg[k] as string) : "";
}

export function Text({
  label,
  k,
  cfg,
  set,
  textarea,
}: {
  label: string;
  k: string;
  cfg: SectionConfig;
  set: (k: string, v: unknown) => void;
  textarea?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {textarea ? (
        <Textarea
          value={str(cfg, k)}
          onChange={(e) => set(k, e.target.value)}
        />
      ) : (
        <Input value={str(cfg, k)} onChange={(e) => set(k, e.target.value)} />
      )}
    </div>
  );
}

export function Num({
  label,
  k,
  cfg,
  set,
}: {
  label: string;
  k: string;
  cfg: SectionConfig;
  set: (k: string, v: unknown) => void;
}) {
  const val = typeof cfg[k] === "number" ? String(cfg[k]) : "";
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        value={val}
        onChange={(e) =>
          set(k, e.target.value === "" ? undefined : Number(e.target.value))
        }
      />
    </div>
  );
}

export function Choice({
  label,
  k,
  cfg,
  set,
  options,
}: {
  label: string;
  k: string;
  cfg: SectionConfig;
  set: (k: string, v: unknown) => void;
  options: { value: string; label: string }[];
}) {
  const val = str(cfg, k) || options[0]?.value;
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <WidgetSelect
        ariaLabel={label}
        value={val}
        options={options}
        onChange={(v) => set(k, v)}
      />
    </div>
  );
}

// CategoryField picks a CMS category (autocomplete over the full tree, like the
// menu builder's link target). Stores the category UUID under `k`. Reuses
// TargetPicker so the UX matches "Menu → Thêm liên kết → Chuyên mục".
export function CategoryField({
  label,
  k,
  cfg,
  set,
}: {
  label: string;
  k: string;
  cfg: SectionConfig;
  set: (k: string, v: unknown) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <TargetPicker
        linkType="category"
        value={str(cfg, k) || null}
        onChange={(id) => set(k, id ?? undefined)}
      />
    </div>
  );
}

// TagField picks a CMS tag by its SLUG (what the article filter matches on),
// searchable over the full flat tag set.
export function TagField({
  label,
  k,
  cfg,
  set,
}: {
  label: string;
  k: string;
  cfg: SectionConfig;
  set: (k: string, v: unknown) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useTagOptions();
  const options = (data ?? []).map((tag) => ({
    value: tag.slug,
    label: tag.name,
  }));
  const val = str(cfg, k);
  const selected = val
    ? (options.find((o) => o.value === val) ?? { value: val, label: val })
    : null;
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        options={options}
        value={selected}
        onChange={(o) => set(k, o?.value ?? undefined)}
        isLoading={isLoading}
        isClearable
        placeholder={t("cms.landings.form.tag_ph")}
      />
    </div>
  );
}

// RichHtml edits an HTML string key via the lazy Tiptap editor.
export function RichHtml({
  label,
  k,
  cfg,
  set,
}: {
  label: string;
  k: string;
  cfg: SectionConfig;
  set: (k: string, v: unknown) => void;
}) {
  // Tiptap binds onUpdate once at mount, so a fresh inline closure would merge
  // into a stale config and drop concurrent edits to other fields. Keep a stable
  // onChange that reads the latest setter via a ref.
  const setRef = useRef(set);
  setRef.current = set;
  const onChange = useCallback((html: string) => setRef.current(k, html), [k]);
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <RichTextEditor
          value={str(cfg, k)}
          initialJSON={null}
          ariaLabel={label}
          onChange={onChange}
        />
      </Suspense>
    </div>
  );
}

// CodeMirrorEditor is heavy (CodeMirror 6) — load it only when an HTML embed
// section is actually edited.
const CodeMirrorEditor = lazy(() => import("./CodeMirrorEditor"));

// CodeField edits a raw-code config key (HTML embed) with an IDE-like editor:
// line numbers, HTML/CSS/JS syntax highlighting, auto-close tags, bracket
// matching, folding + autocomplete (CodeMirror 6). Value stored verbatim; the
// backend sanitizes on publish.
export function CodeField({
  label,
  k,
  cfg,
  set,
}: {
  label: string;
  k: string;
  cfg: SectionConfig;
  set: (k: string, v: unknown) => void;
}) {
  const dark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="overflow-hidden rounded-md border focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
        <Suspense fallback={<Skeleton className="h-72 w-full" />}>
          <CodeMirrorEditor
            value={str(cfg, k)}
            onChange={(v) => set(k, v)}
            dark={dark}
            ariaLabel={label}
          />
        </Suspense>
      </div>
    </div>
  );
}

// ImageUpload only reads value.dataUrl to preview a pending image, never the
// blob (we upload from the stored data URL on Save), so a placeholder satisfies
// the type without carrying bytes through Puck's history.
const PENDING_BLOB = new Blob();

// ImageField edits an image config key using the shared ImageUpload widget (the
// same crop/preview/remove UX as the CMS article's featured image). Uploads are
// DEFERRED: applying an image stores only a preview data URL under
// `<k>__pending`; the real upload to the landing media endpoint happens on Save
// (adapter.resolvePendingImages), which replaces it with <k> (*_path) + its
// sibling *_url. Nothing hits the server until the user clicks Save.
export function ImageField({
  label,
  k,
  cfg,
  onChange,
}: {
  label: string;
  k: string;
  cfg: SectionConfig;
  onChange: (next: SectionConfig) => void;
}) {
  const urlKey = k.replace(/_path$/, "_url");
  const pendingKey = `${k}__pending`;
  const url = str(cfg, urlKey);
  const pending = cfg[pendingKey] as { dataUrl?: string } | undefined;
  const value: ImageUploadValue = pending?.dataUrl
    ? { kind: "pending", dataUrl: pending.dataUrl, blob: PENDING_BLOB }
    : url
      ? { kind: "uploaded", fileId: str(cfg, k), url }
      : { kind: "empty" };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {/* ImageUpload's frame is inline-block; the shadcn Label is inline too, so
          without a block wrapper they share a line and the label reads as
          "beside/below" the image. Wrapping in a block div drops the frame onto
          its own line so the label sits above, like every other field. */}
      <div>
        <ImageUpload
          type="rounded"
          ratio={16 / 9}
          width={240}
          accept="image/jpeg,image/png,image/webp,image/gif"
          showCamera={false}
          // crop editor stays ON (frame the banner), but outputMax=0 exports the
          // cropped region at its NATIVE resolution — no downscale, no quality
          // loss beyond the JPEG re-encode.
          outputMax={0}
          value={value}
          onChange={(v) => {
            if (v.kind === "pending") {
              // defer: keep only the preview data URL; Save does the upload.
              onChange({ ...cfg, [pendingKey]: { dataUrl: v.dataUrl } });
            } else if (v.kind === "empty") {
              const next = { ...cfg };
              delete next[k];
              delete next[urlKey];
              delete next[pendingKey];
              onChange(next);
            }
          }}
        />
      </div>
    </div>
  );
}

// Repeatable renders an editable list of objects: each item gets a render slot
// (with a patch callback) plus a remove button; a single full-width button at
// the foot adds a blank item. `addLabel` is the full button text (e.g. "Add
// button") — it doubles as the field's heading, so no separate label.
export function Repeatable({
  addLabel,
  items,
  onItems,
  makeEmpty,
  render,
}: {
  addLabel: string;
  items: SectionConfig[];
  onItems: (next: SectionConfig[]) => void;
  makeEmpty: () => SectionConfig;
  // onItem REPLACES the whole item (not a merge) so fields can be removed
  // (e.g. clearing an image deletes its *_path/*_url keys).
  render: (
    item: SectionConfig,
    onItem: (next: SectionConfig) => void,
  ) => React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div
          key={i}
          className="relative space-y-2 rounded-md border bg-muted/40 p-3"
        >
          {/* remove = a compact "x" pinned to the card's top-right corner. */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 size-6 text-muted-foreground hover:text-destructive text-destructive"
            aria-label={t("cms.landings.form.remove")}
            onClick={() => onItems(items.filter((_, j) => j !== i))}
          >
            <X className="size-4" />
          </Button>
          {render(item, (nextItem) => {
            const next = [...items];
            next[i] = nextItem;
            onItems(next);
          })}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-1.5 mt-2"
        onClick={() => onItems([...items, makeEmpty()])}
      >
        <Plus className="size-4" />
        {addLabel}
      </Button>
    </div>
  );
}

// asItems reads a config array key as a list of objects (defensive against
// malformed stored data).
export function asItems(cfg: SectionConfig, k: string): SectionConfig[] {
  const v = cfg[k];
  return Array.isArray(v) ? (v as SectionConfig[]) : [];
}
