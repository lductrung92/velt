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
  href: (path: string) => string;
}
export const SiteContext = createContext<SiteContextValue | null>(null);
export function useSite() {
  const value = useContext(SiteContext);
  if (!value) throw new Error("SiteContext is missing");
  return value;
}
