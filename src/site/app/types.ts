import type { BlogState } from "./lib/blog";
import type { SiteLayout } from "./lib/layout";

export interface Member {
  id: string;
  name: string;
  role: string;
  bio: string;
  skills: string[];
  image: string;
  /** The avatar's INTRINSIC size, when the API knows it. */
  imageWidth?: number;
  imageHeight?: number;
  links: { label: string; url: string }[];
  email: string;
  zalo: string;
  color: string;
}
export interface Product {
  id: string;
  name: string;
  summary: string;
  description?: string;
  category?: string;
  audience?: string;
  status?: string;
  featured?: boolean;
  createdAt?: string;
  image?: string;
  /** The cover's INTRINSIC size, when the API knows it. */
  imageWidth?: number;
  imageHeight?: number;
  url?: string;
  example?: boolean;
  skills?: string[];
  memberIds?: string[];
  priceLabel?: string;
  demoUrl?: string;
  demoPlaceholder?: boolean;
  demoAccess?: string;
  demoInstructions?: string[];
  forwardReferral?: boolean;
  /** HTML only from the backend's sanitized, published product snapshot. */
  bodyHtml?: string;
  highlights?: string[];
  platforms?: string[];
  audiences?: string[];
  techStack?: string[];
  version?: string;
  releasedAt?: string;
  gallery?: ProductMedia[];
  developers?: Pick<
    Member,
    "id" | "name" | "role" | "image" | "imageWidth" | "imageHeight"
  >[];
  seo?: ProductSEO;
  alternates?: { locale: string; slug: string; x_default?: boolean }[];
}
/**
 * Which device a capture was taken on. Chosen in the console and stored with
 * the image; the page no longer guesses it from the caption. A laptop and a
 * desktop monitor share `desktop` — both show the wide layout.
 */
export type DeviceKind = "phone" | "tablet" | "desktop";

export interface ProductMedia {
  kind: "image" | "video";
  url: string;
  width?: number;
  height?: number;
  videoUrl?: string;
  caption: string;
  /** Null for captures uploaded before the device column existed. */
  device?: DeviceKind | null;
  /** The one capture the hero shows for that device. */
  isHero?: boolean;
}
export interface ProductSEO {
  title?: string | null;
  description?: string | null;
  canonical_url?: string | null;
  noindex?: boolean;
  nofollow?: boolean;
  og_title?: string | null;
  og_description?: string | null;
  og_image_url?: string | null;
}
export interface ProductPageState {
  status: "ready" | "not-found" | "unavailable" | "redirect";
  product?: Product;
  redirect?: string;
}
export interface SiteContent {
  brand: string;
  email: string;
  zalo: string;
  showProductExamples: boolean;
  members: Member[];
  products: Product[];
}
export interface AppProps {
  url: string;
  year: number;
  blog?: BlogState;
  /** Content the server loaded, serialised so hydration sees the same page. */
  data?: SiteContent;
  /** Sections published for this page, if the console has a landing for it. */
  sections?: PublicSection[];
  /** Header and footer as the console publishes them; absent = the defaults. */
  layout?: SiteLayout;
  /** The language this page is in ("vi" unless the address said otherwise). */
  locale?: string;
  /** The other languages the console configured, for the switcher + hreflang. */
  locales?: string[];
  productPage?: ProductPageState;
}
/** One navigation entry, as the backend's menus.PublicItem sends it. The
 *  values come from the console, so every field is treated as untrusted. */
export interface PublicMenuItem {
  label?: string;
  description?: string | null;
  link_type?: string;
  /** internal/external links. */
  url?: string | null;
  /** article/page/category links — the site builds the address from it. */
  slug?: string | null;
  open_new_tab?: boolean;
  children?: PublicMenuItem[] | null;
}
/** One section of a landing page, as the backend's shared.PublicSection sends
 *  it. config is console input, so it may be missing, partial or malformed. */
export interface PublicSection {
  type: string;
  sort_order: number;
  config?: unknown;
  data?: unknown;
}
