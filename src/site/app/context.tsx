import { createContext, useContext } from "react";
import type { Member, Product, PublicSection, SiteContent } from "./types";
import type { SiteLayout } from "./lib/layout";
import type { BlogState } from "./lib/blog";

export interface SiteContextValue {
  data: SiteContent;
  url: URL;
  referrer?: Member;
  products: Product[];
  isExample: boolean;
  blog: BlogState;
  /** Sections the console published for this page; empty = built-in layout. */
  sections?: PublicSection[];
  /** The header/footer the console published, or the site's own defaults. */
  layout: SiteLayout;
  /** The language being rendered. */
  locale: string;
  /** Languages besides the base one, as configured. */
  locales: string[];
  href: (path: string) => string;
  /** This same page in another language, for the switcher. */
  localeHref: (locale: string) => string;
}
export const SiteContext = createContext<SiteContextValue | null>(null);
export function useSite() {
  const value = useContext(SiteContext);
  if (!value) throw new Error("SiteContext is missing");
  return value;
}
