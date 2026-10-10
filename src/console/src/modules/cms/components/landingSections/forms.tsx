import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";

import type { SectionConfig, SectionType } from "../../services/landing.service";
import {
  asItems,
  CategoryField,
  Choice,
  CodeField,
  ImageField,
  Num,
  Repeatable,
  RichHtml,
  setter,
  TagField,
  Text,
  type SectionFormProps,
} from "./fields";

type TFn = (k: string) => string;

const alignOpts = (t: TFn) => [
  { value: "left", label: t("cms.landings.form.align_left") },
  { value: "center", label: t("cms.landings.form.align_center") },
];
const bgOpts = (t: TFn) => [
  { value: "none", label: t("cms.landings.form.bg_none") },
  { value: "muted", label: t("cms.landings.form.bg_muted") },
  { value: "primary", label: t("cms.landings.form.bg_primary") },
];
const widthOpts = (t: TFn) => [
  { value: "narrow", label: t("cms.landings.form.width_narrow") },
  { value: "normal", label: t("cms.landings.form.width_normal") },
  { value: "wide", label: t("cms.landings.form.width_wide") },
];
const styleOpts = (t: TFn) => [
  { value: "primary", label: t("cms.landings.form.style_primary") },
  { value: "outline", label: t("cms.landings.form.style_outline") },
  { value: "ghost", label: t("cms.landings.form.style_ghost") },
];
const sideOpts = (t: TFn) => [
  { value: "left", label: t("cms.landings.form.side_left") },
  { value: "right", label: t("cms.landings.form.side_right") },
];

// Buttons is the shared buttons[] editor used by hero / cta_banner / media_text.
function Buttons({
  cfg,
  onChange,
}: {
  cfg: SectionConfig;
  onChange: (v: SectionConfig) => void;
}) {
  const { t } = useTranslation();
  return (
    <Repeatable
      addLabel={t("cms.landings.form.add_button")}
      items={asItems(cfg, "buttons")}
      onItems={(next) => onChange({ ...cfg, buttons: next })}
      makeEmpty={() => ({ label: "", href: "", style: "primary" })}
      render={(item, onItem) => {
        const set = (k: string, v: unknown) => onItem({ ...item, [k]: v });
        return (
          <div className="space-y-4 pb-2">
            <Text label={t("cms.landings.form.button_label")} k="label" cfg={item} set={set} />
            <Text label={t("cms.landings.form.button_href")} k="href" cfg={item} set={set} />
            <Choice
              label={t("cms.landings.form.button_style")}
              k="style"
              cfg={item}
              set={set}
              options={styleOpts(t)}
            />
          </div>
        );
      }}
    />
  );
}

function HeroForm({ value, onChange }: SectionFormProps) {
  const { t } = useTranslation();
  const set = setter(value, onChange);
  return (
    <div className="space-y-4">
      <Text label={t("cms.landings.form.eyebrow")} k="eyebrow" cfg={value} set={set} />
      <Text label={t("cms.landings.form.heading")} k="heading" cfg={value} set={set} />
      <Text label={t("cms.landings.form.subheading")} k="subheading" cfg={value} set={set} textarea />
      <ImageField label={t("cms.landings.form.image")} k="image_path" cfg={value} onChange={onChange} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Choice label={t("cms.landings.form.align")} k="align" cfg={value} set={set} options={alignOpts(t)} />
        <Choice label={t("cms.landings.form.background")} k="background" cfg={value} set={set} options={bgOpts(t)} />
      </div>
      <Buttons cfg={value} onChange={onChange} />
    </div>
  );
}

function SliderForm({ value, onChange }: SectionFormProps) {
  const { t } = useTranslation();
  return (
    <Repeatable
      addLabel={t("cms.landings.form.add_slide")}
      items={asItems(value, "slides")}
      onItems={(next) => onChange({ ...value, slides: next })}
      makeEmpty={() => ({})}
      render={(item, onItem) => {
        const set = (k: string, v: unknown) => onItem({ ...item, [k]: v });
        return (
          <div className="space-y-4 pb-2">
            <ImageField label={t("cms.landings.form.image")} k="image_path" cfg={item} onChange={onItem} />
            <Text label={t("cms.landings.form.heading")} k="heading" cfg={item} set={set} />
            <Text label={t("cms.landings.form.subheading")} k="subheading" cfg={item} set={set} />
            <Text label={t("cms.landings.form.href")} k="href" cfg={item} set={set} />
          </div>
        );
      }}
    />
  );
}

function FeaturedArticlesForm({ value, onChange }: SectionFormProps) {
  const { t } = useTranslation();
  const set = setter(value, onChange);
  const filters = (value.filters as SectionConfig) ?? {};
  const setFilter = (k: string, v: unknown) => {
    const next = { ...filters };
    if (v === undefined || v === "") delete next[k];
    else next[k] = v;
    onChange({ ...value, filters: next });
  };
  return (
    <div className="space-y-4">
      <Text label={t("cms.landings.form.title")} k="title" cfg={value} set={set} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Num label={t("cms.landings.form.columns")} k="columns" cfg={value} set={set} />
        <Num label={t("cms.landings.form.limit")} k="limit" cfg={value} set={set} />
      </div>
      <CategoryField label={t("cms.landings.form.category_id")} k="category_id" cfg={filters} set={setFilter} />
      <TagField label={t("cms.landings.form.tag")} k="tag" cfg={filters} set={setFilter} />
    </div>
  );
}

function CategoriesShowcaseForm({ value, onChange }: SectionFormProps) {
  const { t } = useTranslation();
  const set = setter(value, onChange);
  return (
    <div className="space-y-4">
      <Text label={t("cms.landings.form.title")} k="title" cfg={value} set={set} />
      <Num label={t("cms.landings.form.limit")} k="limit" cfg={value} set={set} />
    </div>
  );
}

function RichTextForm({ value, onChange }: SectionFormProps) {
  const { t } = useTranslation();
  const set = setter(value, onChange);
  return (
    <div className="space-y-4">
      <RichHtml label={t("cms.landings.form.body")} k="body_html" cfg={value} set={set} />
      <Choice label={t("cms.landings.form.width")} k="width" cfg={value} set={set} options={widthOpts(t)} />
    </div>
  );
}

function CtaBannerForm({ value, onChange }: SectionFormProps) {
  const { t } = useTranslation();
  const set = setter(value, onChange);
  return (
    <div className="space-y-4">
      <Text label={t("cms.landings.form.heading")} k="heading" cfg={value} set={set} />
      <Text label={t("cms.landings.form.sub")} k="sub" cfg={value} set={set} textarea />
      <div className="grid gap-4 sm:grid-cols-2">
        <Choice label={t("cms.landings.form.align")} k="align" cfg={value} set={set} options={alignOpts(t)} />
        <Choice label={t("cms.landings.form.background")} k="background" cfg={value} set={set} options={bgOpts(t)} />
      </div>
      <Buttons cfg={value} onChange={onChange} />
    </div>
  );
}

function TestimonialsForm({ value, onChange }: SectionFormProps) {
  const { t } = useTranslation();
  const set = setter(value, onChange);
  return (
    <div className="space-y-4">
      <Text label={t("cms.landings.form.title")} k="title" cfg={value} set={set} />
      <Repeatable
        addLabel={t("cms.landings.form.add_testimonial")}
        items={asItems(value, "items")}
        onItems={(next) => onChange({ ...value, items: next })}
        makeEmpty={() => ({})}
        render={(item, onItem) => {
          const iset = (k: string, v: unknown) => onItem({ ...item, [k]: v });
          return (
            <div className="space-y-4 pb-2">
              <Text label={t("cms.landings.form.quote")} k="quote" cfg={item} set={iset} textarea />
              <Text label={t("cms.landings.form.author")} k="author" cfg={item} set={iset} />
              <Text label={t("cms.landings.form.role")} k="role" cfg={item} set={iset} />
              <ImageField label={t("cms.landings.form.avatar")} k="avatar_path" cfg={item} onChange={onItem} />
            </div>
          );
        }}
      />
    </div>
  );
}

function LogosForm({ value, onChange }: SectionFormProps) {
  const { t } = useTranslation();
  const set = setter(value, onChange);
  return (
    <div className="space-y-4">
      <Text label={t("cms.landings.form.title")} k="title" cfg={value} set={set} />
      <Repeatable
        addLabel={t("cms.landings.form.add_logo")}
        items={asItems(value, "items")}
        onItems={(next) => onChange({ ...value, items: next })}
        makeEmpty={() => ({})}
        render={(item, onItem) => {
          const iset = (k: string, v: unknown) => onItem({ ...item, [k]: v });
          return (
            <div className="space-y-4 pb-2">
              <ImageField label={t("cms.landings.form.image")} k="image_path" cfg={item} onChange={onItem} />
              <Text label={t("cms.landings.form.alt")} k="alt" cfg={item} set={iset} />
              <Text label={t("cms.landings.form.href")} k="href" cfg={item} set={iset} />
            </div>
          );
        }}
      />
    </div>
  );
}

function StatsForm({ value, onChange }: SectionFormProps) {
  const { t } = useTranslation();
  const set = setter(value, onChange);
  return (
    <div className="space-y-4">
      <Text label={t("cms.landings.form.title")} k="title" cfg={value} set={set} />
      <Repeatable
        addLabel={t("cms.landings.form.add_stat")}
        items={asItems(value, "items")}
        onItems={(next) => onChange({ ...value, items: next })}
        makeEmpty={() => ({})}
        render={(item, onItem) => {
          const iset = (k: string, v: unknown) => onItem({ ...item, [k]: v });
          return (
            <div className="space-y-4 pb-2">
              <Text label={t("cms.landings.form.value")} k="value" cfg={item} set={iset} />
              <Text label={t("cms.landings.form.label")} k="label" cfg={item} set={iset} />
            </div>
          );
        }}
      />
    </div>
  );
}

function MediaTextForm({ value, onChange }: SectionFormProps) {
  const { t } = useTranslation();
  const set = setter(value, onChange);
  return (
    <div className="space-y-4">
      <Text label={t("cms.landings.form.heading")} k="heading" cfg={value} set={set} />
      <RichHtml label={t("cms.landings.form.body")} k="body_html" cfg={value} set={set} />
      <ImageField label={t("cms.landings.form.image")} k="image_path" cfg={value} onChange={onChange} />
      <Choice label={t("cms.landings.form.media_side")} k="media_side" cfg={value} set={set} options={sideOpts(t)} />
      <Buttons cfg={value} onChange={onChange} />
    </div>
  );
}

function NewsletterForm({ value, onChange }: SectionFormProps) {
  const { t } = useTranslation();
  const set = setter(value, onChange);
  return (
    <div className="space-y-4">
      <Text label={t("cms.landings.form.heading")} k="heading" cfg={value} set={set} />
      <Text label={t("cms.landings.form.sub")} k="sub" cfg={value} set={set} textarea />
      <Text label={t("cms.landings.form.placeholder")} k="placeholder" cfg={value} set={set} />
      <Text label={t("cms.landings.form.button_label")} k="button_label" cfg={value} set={set} />
    </div>
  );
}

function FaqForm({ value, onChange }: SectionFormProps) {
  const { t } = useTranslation();
  const set = setter(value, onChange);
  return (
    <div className="space-y-4">
      <Text label={t("cms.landings.form.title")} k="title" cfg={value} set={set} />
      <Repeatable
        addLabel={t("cms.landings.form.add_faq")}
        items={asItems(value, "items")}
        onItems={(next) => onChange({ ...value, items: next })}
        makeEmpty={() => ({})}
        render={(item, onItem) => {
          const iset = (k: string, v: unknown) => onItem({ ...item, [k]: v });
          return (
            <div className="space-y-4 pb-2">
              <Text label={t("cms.landings.form.question")} k="question" cfg={item} set={iset} />
              <RichHtml label={t("cms.landings.form.answer")} k="answer_html" cfg={item} set={iset} />
            </div>
          );
        }}
      />
    </div>
  );
}

function GalleryForm({ value, onChange }: SectionFormProps) {
  const { t } = useTranslation();
  const set = setter(value, onChange);
  return (
    <div className="space-y-4">
      <Text label={t("cms.landings.form.title")} k="title" cfg={value} set={set} />
      <Num label={t("cms.landings.form.columns")} k="columns" cfg={value} set={set} />
      <Repeatable
        addLabel={t("cms.landings.form.add_gallery")}
        items={asItems(value, "items")}
        onItems={(next) => onChange({ ...value, items: next })}
        makeEmpty={() => ({})}
        render={(item, onItem) => {
          const iset = (k: string, v: unknown) => onItem({ ...item, [k]: v });
          return (
            <div className="space-y-4 pb-2">
              <ImageField label={t("cms.landings.form.image")} k="image_path" cfg={item} onChange={onItem} />
              <Text label={t("cms.landings.form.caption")} k="caption" cfg={item} set={iset} />
              <Text label={t("cms.landings.form.href")} k="href" cfg={item} set={iset} />
            </div>
          );
        }}
      />
    </div>
  );
}

function HtmlEmbedForm({ value, onChange }: SectionFormProps) {
  const { t } = useTranslation();
  const set = setter(value, onChange);
  return (
    <div className="space-y-2">
      <CodeField label={t("cms.landings.form.html")} k="html" cfg={value} set={set} />
      <p className="text-xs text-muted-foreground">{t("cms.landings.form.html_hint")}</p>
    </div>
  );
}

// SECTION_FORMS maps a section type to its config editor.
export const SECTION_FORMS: Record<SectionType, ComponentType<SectionFormProps>> = {
  hero: HeroForm,
  slider: SliderForm,
  featured_articles: FeaturedArticlesForm,
  categories_showcase: CategoriesShowcaseForm,
  rich_text: RichTextForm,
  cta_banner: CtaBannerForm,
  testimonials: TestimonialsForm,
  logos: LogosForm,
  stats: StatsForm,
  media_text: MediaTextForm,
  newsletter: NewsletterForm,
  faq: FaqForm,
  gallery: GalleryForm,
  html_embed: HtmlEmbedForm,
};

// defaultSectionConfig seeds a freshly added section with sensible defaults.
export function defaultSectionConfig(type: SectionType): SectionConfig {
  switch (type) {
    case "featured_articles":
      return { columns: 3, limit: 6, filters: {} };
    case "categories_showcase":
      return { limit: 12 };
    case "rich_text":
      return { width: "normal" };
    case "cta_banner":
      return { align: "center", background: "muted" };
    case "hero":
      return { align: "center", background: "none" };
    case "media_text":
      return { media_side: "left" };
    case "gallery":
      return { columns: 3, items: [] };
    default:
      return {};
  }
}
