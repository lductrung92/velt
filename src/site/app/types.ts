import type { BlogState } from "./lib/blog";

export interface Member {
  id: string;
  name: string;
  role: string;
  bio: string;
  skills: string[];
  image: string;
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
}
