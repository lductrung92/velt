// Defaults for the home sections. Every value here is the copy the component
// used to hard-code, so a section with no config renders exactly as before.
import type { Member, Product, PublicSection } from "../types";
import type { T } from "./i18n";

export interface AudienceItem {
  key: string;
  label: string;
  headline: string;
  body: string;
  cta_label: string;
  cta_href: string;
}
export interface AudienceConfig {
  title: string;
  subtitle: string;
  items: AudienceItem[];
}
export interface ProductGridConfig {
  title: string;
  subtitle: string;
  limit: number;
  category: string;
  show_all_label: string;
  show_all_href: string;
}
export interface TeamConfig {
  title: string;
  subtitle: string;
  limit: number;
}
export interface BuyingStep {
  title: string;
  body: string;
}
export interface BuyingStepsConfig {
  title: string;
  subtitle: string;
  steps: BuyingStep[];
}
export interface ContactConfig {
  title: string;
  subtitle: string;
  email: string;
  zalo: string;
  note: string;
}

// The trailing space in each cta label separates it from the arrow icon.
export const audienceDefaults = (t: T): AudienceConfig => ({
  title: t("audience.title"),
  subtitle: t("audience.subtitle"),
  // These keys are CODES, shared with the contact form and with the API's own
  // audience vocabulary — never words. The artwork and the message tables both
  // look themselves up by them.
  items: (["individual", "team", "business"] as const).map((key) => ({
    key,
    label: t(`audience.${key}.label`),
    headline: t(`audience.${key}.headline`),
    body: t(`audience.${key}.body`),
    cta_label: t(`audience.${key}.cta`),
    cta_href: "/#contact",
  })),
});

export const productGridDefaults = (t: T): ProductGridConfig => ({
  title: t("product_grid.title"),
  subtitle: t("product_grid.subtitle"),
  limit: 6,
  category: "",
  show_all_label: t("product_grid.show_all"),
  show_all_href: "/products",
});

// limit 0 keeps today's behaviour: the team section shows every member.
export const teamDefaults = (t: T): TeamConfig => ({
  title: t("team.title"),
  subtitle: t("team.subtitle"),
  limit: 0,
});

export const buyingStepsDefaults = (t: T): BuyingStepsConfig => ({
  title: t("steps.title"),
  subtitle: t("steps.subtitle"),
  steps: (["one", "two", "three"] as const).map((step) => ({
    title: t(`steps.${step}.title`),
    body: t(`steps.${step}.body`),
  })),
});

// A newline is the line break the heading and the paragraph already render.
// email, zalo and note stay empty because today those come from site data and
// from whether a contact channel exists; empty keeps that logic untouched.
export const contactDefaults = (t: T): ContactConfig => ({
  title: t("contact_section.title"),
  subtitle: t("contact_section.subtitle"),
  email: "",
  zalo: "",
  note: "",
});

const fields = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

// Blank counts as absent: a section must never render empty because somebody
// cleared a field in the console.
const text = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value : fallback;

const count = (value: unknown, fallback: number) => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" &&
    Number.isInteger(parsed) &&
    parsed > 0 &&
    parsed < 1000
    ? parsed
    : fallback;
};

// Entries past the end of the defaults still get a complete fallback, so a
// missing field can never leave a card half-rendered.
function entries<T>(
  value: unknown,
  fallback: T[],
  one: (raw: Record<string, unknown>, base: T) => T,
): T[] {
  if (!Array.isArray(value) || !value.length) return fallback;
  return value.map((entry, index) =>
    one(fields(entry), fallback[index % fallback.length]),
  );
}

export function audienceConfig(config: unknown, t: T): AudienceConfig {
  const raw = fields(config);
  const d = audienceDefaults(t);
  return {
    title: text(raw.title, d.title),
    subtitle: text(raw.subtitle, d.subtitle),
    items: entries(raw.items, d.items, (item, base) => ({
      key: text(item.key, base.key),
      label: text(item.label, base.label),
      headline: text(item.headline, base.headline),
      body: text(item.body, base.body),
      cta_label: text(item.cta_label, base.cta_label),
      cta_href: text(item.cta_href, base.cta_href),
    })),
  };
}

export function productGridConfig(config: unknown, t: T): ProductGridConfig {
  const raw = fields(config);
  const d = productGridDefaults(t);
  return {
    title: text(raw.title, d.title),
    subtitle: text(raw.subtitle, d.subtitle),
    limit: count(raw.limit, d.limit),
    category: text(raw.category, d.category),
    show_all_label: text(raw.show_all_label, d.show_all_label),
    show_all_href: text(raw.show_all_href, d.show_all_href),
  };
}

export function teamConfig(config: unknown, t: T): TeamConfig {
  const raw = fields(config);
  const d = teamDefaults(t);
  return {
    title: text(raw.title, d.title),
    subtitle: text(raw.subtitle, d.subtitle),
    limit: count(raw.limit, d.limit),
  };
}

export function buyingStepsConfig(config: unknown, t: T): BuyingStepsConfig {
  const raw = fields(config);
  const d = buyingStepsDefaults(t);
  return {
    title: text(raw.title, d.title),
    subtitle: text(raw.subtitle, d.subtitle),
    steps: entries(raw.steps, d.steps, (step, base) => ({
      title: text(step.title, base.title),
      body: text(step.body, base.body),
    })),
  };
}

export function contactConfig(config: unknown, t: T): ContactConfig {
  const raw = fields(config);
  const d = contactDefaults(t);
  return {
    title: text(raw.title, d.title),
    subtitle: text(raw.subtitle, d.subtitle),
    email: text(raw.email, d.email),
    zalo: text(raw.zalo, d.zalo),
    note: text(raw.note, d.note),
  };
}

// Section data is what the backend joined in; anything else falls back to the
// catalogue the site already loaded.
export const sectionList = <T extends Member | Product>(
  data: unknown,
): T[] | undefined =>
  Array.isArray(data) && data.every((item) => item && typeof item === "object")
    ? (data as T[])
    : undefined;

/**
 * The home page as it shipped before the builder existed: eight sections, this
 * order, no config — every component falls back to its own copy. This is the
 * page a visitor sees until somebody publishes a landing for it, and it is the
 * baseline the pixel comparison is run against.
 */
export interface HeroConfig {
  eyebrow: string;
  heading: string;
  subheading: string;
}

/**
 * The hero's copy as the page shipped it. `heading` carries the newline where
 * the headline breaks; the component turns it back into the <br /> that was
 * always there, so a one-line heading typed in the console just renders on one
 * line.
 */
export const heroDefaults = (t: T): HeroConfig => ({
  eyebrow: t("hero.eyebrow"),
  heading: t("hero.heading"),
  subheading: t("hero.subheading"),
});

export interface FAQItem {
  question: string;
  answer_html: string;
}

export interface FAQConfig {
  eyebrow: string;
  title: string;
  subtitle: string;
  items: FAQItem[];
}

export const faqDefaults = (t: T): FAQConfig => ({
  eyebrow: t("faq.eyebrow"),
  title: t("faq.title"),
  subtitle: t("faq.subtitle"),
  items: (["one", "two", "three", "four"] as const).map((item) => ({
    question: t(`faq.${item}.question`),
    answer_html: t(`faq.${item}.answer`),
  })),
});

export function heroConfig(config: unknown, t: T): HeroConfig {
  const raw = fields(config);
  const d = heroDefaults(t);
  return {
    eyebrow: text(raw.eyebrow, d.eyebrow),
    heading: text(raw.heading, d.heading),
    subheading: text(raw.subheading, d.subheading),
  };
}

export function faqConfig(config: unknown, t: T): FAQConfig {
  const raw = fields(config);
  const d = faqDefaults(t);
  return {
    eyebrow: text(raw.eyebrow, d.eyebrow),
    title: text(raw.title, d.title),
    subtitle: text(raw.subtitle, d.subtitle),
    items: entries(raw.items, d.items, (item, base) => ({
      question: text(item.question, base.question),
      answer_html: text(item.answer_html, base.answer_html),
    })),
  };
}

export const DEFAULT_HOME_SECTIONS: PublicSection[] = [
  "hero",
  "audience_picker",
  "product_grid",
  "team",
  "buying_steps",
  "featured_articles",
  "faq",
  "contact_form",
].map((type, i) => ({ type, sort_order: i, config: null, data: null }));

/** Reads a section's `limit`, ignoring anything that is not a usable count. */
export function sectionLimit(config?: unknown): number | undefined {
  const raw = fields(config).limit;
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 999
    ? n
    : undefined;
}
