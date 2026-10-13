// Defaults for the home sections. Every value here is the copy the component
// used to hard-code, so a section with no config renders exactly as before.
import type { Member, Product, PublicSection } from "../types";

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

export const audienceDefaults: AudienceConfig = {
  title: "Sản phẩm phù hợp với nhu cầu của bạn",
  subtitle:
    "Sản phẩm số cho công việc cá nhân, phối hợp trong nhóm và vận hành doanh nghiệp.",
  items: [
    {
      key: "individual",
      label: "Cá nhân",
      headline: "Dành cho cá nhân",
      body: "Khám phá các công cụ phục vụ công việc hằng ngày: ghi chú, sắp xếp thông tin và quản lý công việc cá nhân.",
      // The trailing space separates the label from the arrow icon.
      cta_label: "Tư vấn cho cá nhân ",
      cta_href: "/#contact",
    },
    {
      key: "group",
      label: "Nhóm",
      headline: "Dành cho nhóm",
      body: "Tìm sản phẩm giúp nhóm tổ chức công việc, chia sẻ tài liệu và theo dõi tiến độ trong cùng một không gian.",
      cta_label: "Tư vấn cho nhóm ",
      cta_href: "/#contact",
    },
    {
      key: "business",
      label: "Doanh nghiệp",
      headline: "Dành cho doanh nghiệp",
      body: "Xem các sản phẩm phục vụ quản lý và vận hành. Tìm hiểu tính năng, phạm vi sử dụng và chi phí trước khi mua.",
      cta_label: "Tư vấn cho doanh nghiệp ",
      cta_href: "/#contact",
    },
  ],
};

export const productGridDefaults: ProductGridConfig = {
  title: "Sản phẩm của ZUKATEK",
  subtitle:
    "Khám phá tính năng, mở bản demo và nhận tư vấn về sản phẩm bạn quan tâm.",
  limit: 6,
  category: "",
  show_all_label: "Xem tất cả sản phẩm ",
  show_all_href: "/products",
};

// limit 0 keeps today's behaviour: the team section shows every member.
export const teamDefaults: TeamConfig = {
  title: "Đội ngũ phát triển",
  subtitle: "Những người trực tiếp xây dựng và phát triển sản phẩm Zukatek.",
  limit: 0,
};

export const buyingStepsDefaults: BuyingStepsConfig = {
  title: "Chọn mua sản phẩm ZUKATEK",
  subtitle: "Ba bước để chọn mua sản phẩm phù hợp với nhu cầu của bạn.",
  steps: [
    {
      title: "Chọn sản phẩm",
      body: "Xem danh mục, tính năng và đối tượng sử dụng để tìm sản phẩm phù hợp.",
    },
    {
      title: "Trải nghiệm bản demo",
      body: "Mở bản trải nghiệm riêng của sản phẩm và kiểm tra các tính năng bạn cần.",
    },
    {
      title: "Liên hệ mua sản phẩm",
      body: "Nhận tư vấn về giá, phạm vi sử dụng và cách triển khai từ người giới thiệu hoặc ZUKATEK.",
    },
  ],
};

// A newline is the line break the heading and the paragraph already render.
// email, zalo and note stay empty because today those come from site data and
// from whether a contact channel exists; empty keeps that logic untouched.
export const contactDefaults: ContactConfig = {
  title: "Cần tư vấn sản phẩm?\nLiên hệ ZUKATEK.",
  subtitle:
    "Nhận tư vấn về tính năng, giá và cách triển khai\ntừ người giới thiệu hoặc đội ngũ ZUKATEK.",
  email: "",
  zalo: "",
  note: "",
};

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

export function audienceConfig(config?: unknown): AudienceConfig {
  const raw = fields(config);
  return {
    title: text(raw.title, audienceDefaults.title),
    subtitle: text(raw.subtitle, audienceDefaults.subtitle),
    items: entries(raw.items, audienceDefaults.items, (item, base) => ({
      key: text(item.key, base.key),
      label: text(item.label, base.label),
      headline: text(item.headline, base.headline),
      body: text(item.body, base.body),
      cta_label: text(item.cta_label, base.cta_label),
      cta_href: text(item.cta_href, base.cta_href),
    })),
  };
}

export function productGridConfig(config?: unknown): ProductGridConfig {
  const raw = fields(config);
  return {
    title: text(raw.title, productGridDefaults.title),
    subtitle: text(raw.subtitle, productGridDefaults.subtitle),
    limit: count(raw.limit, productGridDefaults.limit),
    category: text(raw.category, productGridDefaults.category),
    show_all_label: text(
      raw.show_all_label,
      productGridDefaults.show_all_label,
    ),
    show_all_href: text(raw.show_all_href, productGridDefaults.show_all_href),
  };
}

export function teamConfig(config?: unknown): TeamConfig {
  const raw = fields(config);
  return {
    title: text(raw.title, teamDefaults.title),
    subtitle: text(raw.subtitle, teamDefaults.subtitle),
    limit: count(raw.limit, teamDefaults.limit),
  };
}

export function buyingStepsConfig(config?: unknown): BuyingStepsConfig {
  const raw = fields(config);
  return {
    title: text(raw.title, buyingStepsDefaults.title),
    subtitle: text(raw.subtitle, buyingStepsDefaults.subtitle),
    steps: entries(raw.steps, buyingStepsDefaults.steps, (step, base) => ({
      title: text(step.title, base.title),
      body: text(step.body, base.body),
    })),
  };
}

export function contactConfig(config?: unknown): ContactConfig {
  const raw = fields(config);
  return {
    title: text(raw.title, contactDefaults.title),
    subtitle: text(raw.subtitle, contactDefaults.subtitle),
    email: text(raw.email, contactDefaults.email),
    zalo: text(raw.zalo, contactDefaults.zalo),
    note: text(raw.note, contactDefaults.note),
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
