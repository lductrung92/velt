import { createContext, useContext } from "react";
import type { Member, Product, SiteContent } from "./types";

export interface SiteContextValue {
  data: SiteContent;
  url: URL;
  referrer?: Member;
  products: Product[];
  isExample: boolean;
  href: (path: string) => string;
}
export const SiteContext = createContext<SiteContextValue | null>(null);
export function useSite() {
  const value = useContext(SiteContext);
  if (!value) throw new Error("SiteContext is missing");
  return value;
}
