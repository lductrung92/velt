import type { PageSEO } from "../services/pages.service";

// SEO helpers for a CMS page. The backend replaces the whole `seo` object on
// save, so an editor always holds all 8 fields and normalizeSeo turns trimmed
// text into null before the payload goes out.
//
// The section component that used to live here is gone: every editor now builds
// its SEO card from the shared editor chrome (src/styles/editor-page.css) so the
// heading band matches the rest of the screen.

export const EMPTY_SEO: PageSEO = {
  title: null,
  description: null,
  keywords: null,
  canonical_url: null,
  noindex: false,
  nofollow: false,
  og_title: null,
  og_description: null,
};

export function normalizeSeo(seo: PageSEO): PageSEO {
  const s = (v?: string | null) => (v ?? "").trim() || null;
  return {
    title: s(seo.title),
    description: s(seo.description),
    keywords: s(seo.keywords),
    canonical_url: s(seo.canonical_url),
    noindex: !!seo.noindex,
    nofollow: !!seo.nofollow,
    og_title: s(seo.og_title),
    og_description: s(seo.og_description),
  };
}

// normalizeSeo emits keys in a fixed order, so JSON compare is stable.
export function seoEquals(a: PageSEO, b: PageSEO): boolean {
  return JSON.stringify(normalizeSeo(a)) === JSON.stringify(normalizeSeo(b));
}

// Field plan mirrors the article editor's SEO card 1:1 (same order, controls and
// max lengths) so both CMS editors read identically. State-driven (this form's
// seo lives outside react-hook-form), but the markup matches FormItem spacing.
