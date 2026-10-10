import DOMPurify from "dompurify";
import { ImageIcon } from "lucide-react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";

import type { SectionConfig, SectionType } from "../../services/landing.service";

// In-canvas visual preview for each landing section type. These mirror the
// public web renderers (web/modules/cms/landing) closely enough for editing —
// same config keys, same layout intent — using the console's Tailwind. They are
// presentational only (buttons/links are inert; dynamic sections and raw HTML
// embeds show a safe placeholder rather than resolving/executing content in the
// admin panel). Puck mounts these as each component's `render` (see puckConfig).

export interface PreviewProps {
  cfg: SectionConfig;
}

// ── small readers over the untyped config ──
const str = (cfg: SectionConfig, k: string): string =>
  typeof cfg[k] === "string" ? (cfg[k] as string) : "";
const num = (cfg: SectionConfig, k: string, d: number): number =>
  typeof cfg[k] === "number" ? (cfg[k] as number) : d;
const list = (cfg: SectionConfig, k: string): SectionConfig[] =>
  Array.isArray(cfg[k]) ? (cfg[k] as SectionConfig[]) : [];

// imgSrc resolves an image field's display URL. It prefers the just-picked,
// not-yet-uploaded preview (the data URL ImageField stores under
// "<path>__pending" during its deferred upload) so the canvas reflects a pick
// immediately; otherwise it falls back to the stored "*_url". Pass the URL key
// (e.g. "image_url" / "avatar_url").
const imgSrc = (cfg: SectionConfig, urlKey: string): string => {
  const pathKey = urlKey.replace(/_url$/, "_path");
  const pending = cfg[`${pathKey}__pending`] as { dataUrl?: string } | undefined;
  if (pending?.dataUrl) return pending.dataUrl;
  return str(cfg, urlKey);
};

const bgClass = (cfg: SectionConfig): string => {
  const bg = str(cfg, "background");
  if (bg === "muted") return "bg-muted";
  if (bg === "primary") return "bg-primary/10";
  return "";
};
const alignCenter = (cfg: SectionConfig): boolean =>
  str(cfg, "align") !== "left";

type Btn = { label?: string; style?: string };
const btnClass = (style?: string): string =>
  style === "outline"
    ? "border border-input"
    : style === "ghost"
      ? "hover:bg-muted"
      : "bg-primary text-primary-foreground";

// Inert button row (preview only — no navigation).
function Buttons({ items, center }: { items: SectionConfig[]; center: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className={`mt-4 flex flex-wrap gap-3 ${center ? "justify-center" : ""}`}>
      {(items as Btn[]).map((b, i) => (
        <span
          key={i}
          className={`inline-flex min-w-16 items-center justify-center rounded-md px-4 py-2 text-sm font-medium ${btnClass(
            b.style,
          )}`}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}

// Rich HTML from Tiptap (rich_text / media_text / faq). Stored data is sanitized
// on write by the backend, but this also renders LIVE draft input (pre-save) in
// the admin origin, so sanitize client-side too — parity with widgetPreview, so
// an onerror/onload payload can never execute in a cms.landing.manage session.
// Console has no `prose` plugin, so apply minimal element styling inline.
function Html({ html }: { html: string }) {
  return (
    <div
      className="text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
    />
  );
}

// A framed image, or a muted placeholder when no url is set yet.
function Img({ url, className }: { url: string; className: string }) {
  if (url) return <img src={url} alt="" className={className} />;
  return (
    <div className={`flex items-center justify-center bg-muted ${className}`}>
      <ImageIcon className="size-6 text-muted-foreground" />
    </div>
  );
}

function SectionTitle({ text }: { text: string }) {
  if (!text) return null;
  return <h2 className="mb-6 text-center text-2xl font-bold">{text}</h2>;
}

// ── the 14 previews ──

function HeroPreview({ cfg }: PreviewProps) {
  const center = alignCenter(cfg);
  return (
    <div className={`px-4 py-10 ${bgClass(cfg)}`}>
      <div
        className={`mx-auto flex max-w-3xl flex-col gap-3 ${
          center ? "items-center text-center" : "items-start text-left"
        }`}
      >
        {str(cfg, "eyebrow") && (
          <span className="text-sm font-semibold uppercase tracking-wide text-primary">
            {str(cfg, "eyebrow")}
          </span>
        )}
        <h1 className="text-2xl font-extrabold">{str(cfg, "heading")}</h1>
        {str(cfg, "subheading") && (
          <p className="text-lg text-muted-foreground">{str(cfg, "subheading")}</p>
        )}
        {imgSrc(cfg, "image_url") && (
          <img
            src={imgSrc(cfg, "image_url")}
            alt=""
            className="mt-2 aspect-video w-full max-w-2xl rounded-2xl object-cover"
          />
        )}
        <Buttons items={list(cfg, "buttons")} center={center} />
      </div>
    </div>
  );
}

function SliderPreview({ cfg }: PreviewProps) {
  const slides = list(cfg, "slides");
  const s = slides[0];
  return (
    <div className="px-4 py-6">
      <div className="relative overflow-hidden rounded-2xl">
        <Img
          url={s ? imgSrc(s, "image_url") : ""}
          className="aspect-[16/7] w-full object-cover"
        />
        {s && (str(s, "heading") || str(s, "subheading")) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 text-center text-white">
            <div className="text-2xl font-bold">{str(s, "heading")}</div>
            {str(s, "subheading") && (
              <div className="text-sm">{str(s, "subheading")}</div>
            )}
          </div>
        )}
      </div>
      {slides.length > 1 && (
        <div className="mt-3 flex justify-center gap-2">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`size-2 rounded-full ${i === 0 ? "bg-primary" : "bg-muted-foreground/40"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// featured_articles + categories_showcase resolve live server data; the editor
// can't, so show the title + a skeleton + a hint that data loads on publish.
function DynamicHint() {
  const { t } = useTranslation();
  return (
    <div className="mt-2 text-center text-xs text-muted-foreground">
      {t("cms.landings.preview.dynamic_hint")}
    </div>
  );
}

function FeaturedArticlesPreview({ cfg }: PreviewProps) {
  const columns = Math.min(Math.max(num(cfg, "columns", 3), 2), 4);
  return (
    <div className="px-4 py-6">
      <SectionTitle text={str(cfg, "title")} />
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }, (_, i) => (
          <div key={i} className="space-y-2 rounded-xl border p-4">
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-2/3 rounded bg-muted" />
          </div>
        ))}
      </div>
      <DynamicHint />
    </div>
  );
}

function CategoriesShowcasePreview({ cfg }: PreviewProps) {
  return (
    <div className="px-4 py-6">
      <SectionTitle text={str(cfg, "title")} />
      <div className="flex flex-wrap justify-center gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className="h-9 w-24 rounded-full border bg-muted/40"
            aria-hidden
          />
        ))}
      </div>
      <DynamicHint />
    </div>
  );
}

function RichTextPreview({ cfg }: PreviewProps) {
  const width = str(cfg, "width");
  const max =
    width === "narrow"
      ? "max-w-2xl"
      : width === "wide"
        ? "max-w-none"
        : "max-w-4xl";
  return (
    <div className="px-4 py-6">
      <div className={`mx-auto ${max}`}>
        <Html html={str(cfg, "body_html")} />
      </div>
    </div>
  );
}

function CtaBannerPreview({ cfg }: PreviewProps) {
  const center = alignCenter(cfg);
  const bg = bgClass(cfg) || "bg-primary/10";
  return (
    <div className="px-4 py-6">
      <div
        className={`rounded-2xl p-8 ${bg} ${center ? "text-center" : "text-left"}`}
      >
        <h2 className="text-2xl font-extrabold">{str(cfg, "heading")}</h2>
        {str(cfg, "sub") && (
          <p className="mt-2 text-muted-foreground">{str(cfg, "sub")}</p>
        )}
        <Buttons items={list(cfg, "buttons")} center={center} />
      </div>
    </div>
  );
}

function TestimonialsPreview({ cfg }: PreviewProps) {
  const items = list(cfg, "items");
  return (
    <div className="px-4 py-6">
      <SectionTitle text={str(cfg, "title")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it, i) => (
          <figure key={i} className="rounded-xl border p-5">
            <blockquote className="text-sm">{str(it, "quote")}</blockquote>
            <figcaption className="mt-4 flex items-center gap-3">
              <Img url={imgSrc(it, "avatar_url")} className="size-9 rounded-full object-cover" />
              <div>
                <div className="text-sm font-semibold">{str(it, "author")}</div>
                {str(it, "role") && (
                  <div className="text-xs text-muted-foreground">{str(it, "role")}</div>
                )}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function LogosPreview({ cfg }: PreviewProps) {
  const items = list(cfg, "items");
  return (
    <div className="px-4 py-6">
      <SectionTitle text={str(cfg, "title")} />
      <div className="flex flex-wrap items-center justify-center gap-8">
        {items.map((it, i) => (
          <Img
            key={i}
            url={imgSrc(it, "image_url")}
            className="h-10 w-24 rounded object-contain opacity-70"
          />
        ))}
      </div>
    </div>
  );
}

function StatsPreview({ cfg }: PreviewProps) {
  const items = list(cfg, "items");
  return (
    <div className="px-4 py-6">
      <SectionTitle text={str(cfg, "title")} />
      <div className="grid gap-4 sm:grid-cols-3">
        {items.map((it, i) => (
          <div key={i} className="rounded-xl border p-6 text-center">
            <div className="text-3xl font-extrabold text-primary">{str(it, "value")}</div>
            <div className="mt-1 text-sm text-muted-foreground">{str(it, "label")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MediaTextPreview({ cfg }: PreviewProps) {
  const right = str(cfg, "media_side") === "right";
  return (
    <div className="px-4 py-6">
      <div className="grid items-center gap-8 md:grid-cols-2">
        <Img
          url={imgSrc(cfg, "image_url")}
          className={`aspect-video w-full rounded-2xl object-cover ${right ? "md:order-2" : ""}`}
        />
        <div>
          <h2 className="text-2xl font-bold">{str(cfg, "heading")}</h2>
          <div className="mt-3">
            <Html html={str(cfg, "body_html")} />
          </div>
          <Buttons items={list(cfg, "buttons")} center={false} />
        </div>
      </div>
    </div>
  );
}

function NewsletterPreview({ cfg }: PreviewProps) {
  const { t } = useTranslation();
  return (
    <div className="px-4 py-6">
      <div className="rounded-2xl bg-muted p-8 text-center">
        <h2 className="text-2xl font-bold">{str(cfg, "heading")}</h2>
        {str(cfg, "sub") && (
          <p className="mt-2 text-muted-foreground">{str(cfg, "sub")}</p>
        )}
        <div className="mt-4 flex justify-center gap-2">
          <span className="inline-flex h-11 w-64 items-center rounded-full border border-input bg-background px-4 text-sm text-muted-foreground">
            {str(cfg, "placeholder") || t("cms.landings.preview.email_placeholder")}
          </span>
          <span className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground">
            {str(cfg, "button_label") || t("cms.landings.preview.subscribe")}
          </span>
        </div>
      </div>
    </div>
  );
}

function FaqPreview({ cfg }: PreviewProps) {
  const items = list(cfg, "items");
  return (
    <div className="px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <SectionTitle text={str(cfg, "title")} />
        <div className="divide-y rounded-xl border">
          {items.map((it, i) => (
            <div key={i} className="p-4">
              <div className="font-medium">{str(it, "question")}</div>
              {str(it, "answer_html") && (
                <div className="mt-2">
                  <Html html={str(it, "answer_html")} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GalleryPreview({ cfg }: PreviewProps) {
  const columns = Math.min(Math.max(num(cfg, "columns", 3), 2), 4);
  const items = list(cfg, "items");
  return (
    <div className="px-4 py-6">
      <SectionTitle text={str(cfg, "title")} />
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {items.map((it, i) => (
          <figure key={i}>
            <Img url={imgSrc(it, "image_url")} className="aspect-video w-full rounded-lg object-cover" />
            {str(it, "caption") && (
              <figcaption className="mt-1 text-center text-xs text-muted-foreground">
                {str(it, "caption")}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </div>
  );
}

// Raw admin HTML — not sanitized until publish, so DON'T execute it in the admin
// panel. Show a labeled placeholder (safe) rather than rendering arbitrary
// markup/iframes here; the real embed appears on the published page.
function HtmlEmbedPreview({ cfg }: PreviewProps) {
  const { t } = useTranslation();
  const html = str(cfg, "html");
  return (
    <div className="px-4 py-6">
      {html ? (
        // Render the entered markup in a sandboxed iframe: allow-scripts (so
        // css/js run in the preview) but NO allow-same-origin → the embed is
        // isolated from the admin app (can't touch its DOM/cookies).
        <iframe
          title={t("cms.landings.preview.html_embed")}
          srcDoc={html}
          sandbox="allow-scripts allow-popups allow-forms"
          className="h-72 w-full rounded-lg border bg-white"
        />
      ) : (
        <div className="flex items-center justify-center rounded-xl border border-dashed bg-muted/40 py-10 text-sm font-medium text-muted-foreground">
          {t("cms.landings.preview.html_embed")}
        </div>
      )}
    </div>
  );
}

export const SECTION_PREVIEWS: Record<SectionType, ComponentType<PreviewProps>> =
  {
    hero: HeroPreview,
    slider: SliderPreview,
    featured_articles: FeaturedArticlesPreview,
    categories_showcase: CategoriesShowcasePreview,
    rich_text: RichTextPreview,
    cta_banner: CtaBannerPreview,
    testimonials: TestimonialsPreview,
    logos: LogosPreview,
    stats: StatsPreview,
    media_text: MediaTextPreview,
    newsletter: NewsletterPreview,
    faq: FaqPreview,
    gallery: GalleryPreview,
    html_embed: HtmlEmbedPreview,
  };
