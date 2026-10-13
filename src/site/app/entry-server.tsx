import { renderToString } from "react-dom/server";
import { App, resolveRoute } from "./App";
import type { AppProps, PublicSection, SiteContent } from "./types";
import { blogPath, emptyBlog, type BlogState } from "./lib/blog";
import { loadBlog, articleRedirect } from "./lib/blog.server";
import { loadSiteContent } from "./lib/site.server";
import { loadHomeSections } from "./lib/landing.server";
import { loadLayout } from "./lib/layout.server";
import type { SiteLayout } from "./lib/layout";
import { localeConfig } from "./lib/cache.server";
import {
  alternatesFor,
  BASE_LOCALE,
  splitLocale,
  withLocale,
} from "./lib/locales";
import { translator } from "./lib/i18n";

export function render(
  path: string,
  blog: BlogState = emptyBlog(),
  data?: SiteContent,
  sections?: PublicSection[],
  layout?: SiteLayout,
  locale: string = BASE_LOCALE,
  locales: string[] = [],
) {
  // `path` is already stripped of its language prefix: the router matches the
  // same routes in every language, and the prefix is put back by every link
  // the page writes (see App's href).
  const t = translator(locale);
  const url = new URL(path, "http://site.local"),
    route = resolveRoute(url, data, blog);
  const props: AppProps = {
    url: url.pathname + url.search,
    year: new Date().getUTCFullYear(),
    blog,
    data,
    sections,
    layout,
    locale,
    locales,
  };
  const title = route.home
    ? t("seo.home_title")
    : route.blogList
      ? t("seo.blog_title")
      : route.blogDetail && blog.article
        ? blog.article.seo?.title ||
          t("seo.article_title", { title: blog.article.title })
        : route.catalog
          ? t("seo.catalog_title")
          : route.product
            ? t("seo.product_title", { name: route.product.name }) +
              (route.product.example ? t("seo.product_example_suffix") : "")
            : t("seo.notfound_title");
  const description =
    (route.blogDetail
      ? blog.article?.seo?.description || blog.article?.excerpt
      : route.blogList
        ? t("seo.blog_description")
        : undefined) ||
    route.product?.summary ||
    t("seo.default_description");
  return {
    html: renderToString(<App {...props} />),
    props,
    status: route.status,
    title,
    description,
    ogTitle: blog.article?.seo?.og_title || title,
    ogDescription: blog.article?.seo?.og_description || description,
    ogType: route.blogDetail && blog.article ? "article" : "website",
    lang: locale,
    // The server writes the <noscript> note, so it is handed the sentence
    // rather than keeping a second copy of it in another language.
    noscript: t("noscript.note"),
    // Every page says which languages it exists in, itself included, and which
    // one answers for a reader whose language is not among them. A set that
    // does not reference back is ignored, so this is built from one list.
    //
    // An article's address differs per language, so its own alternates (from
    // the published read model) win over the plain prefix mapping.
    alternates: alternatesFor(
      url.pathname,
      locales,
      route.blogDetail && blog.article?.alternates
        ? Object.fromEntries(
            blog.article.alternates.map((alt) => [
              alt.locale,
              blogPath(alt.slug),
            ]),
          )
        : undefined,
    ),
    canonical: withLocale(
      blog.article?.seo?.canonical_url ||
        (route.blogList
          ? "/blog"
          : route.blogDetail && blog.article
            ? blogPath(blog.article.slug)
            : url.pathname),
      locale,
    ),
    noindex:
      !!blog.article?.seo?.noindex ||
      route.status !== 200 ||
      (route.blogList && !!url.searchParams.get("q")),
    nofollow: !!blog.article?.seo?.nofollow,
    image: blog.article?.cover_url,
  };
}

// Fetch published content on the server; serialize the same snapshot for hydration.
export async function renderRequest(path: string) {
  // Which language this address is in has to be known before anything is
  // loaded: it picks the content, and it keys every cache behind it.
  const { extras } = await localeConfig();
  const requested = new URL(path, "http://site.local");
  const { locale, path: routePath } = splitLocale(requested.pathname, extras);
  const inner = routePath + requested.search;
  const url = new URL(inner, "http://site.local");
  const needsBlog =
    url.pathname === "/" ||
    url.pathname === "/index.html" ||
    url.pathname === "/blog" ||
    url.pathname.startsWith("/blog/");
  // Content and blog are independent reads; fetch them together.
  // The home page may be driven by a published landing; other routes never are,
  // so they do not pay for the lookup.
  const isHome = url.pathname === "/" || url.pathname === "/index.html";
  const [blog, site, sections, layout] = await Promise.all([
    needsBlog
      ? loadBlog(inner, fetch, undefined, locale)
      : Promise.resolve(emptyBlog()),
    loadSiteContent(fetch, locale),
    isHome ? loadHomeSections(fetch, locale) : Promise.resolve([]),
    // The header and footer are on every route, home or not.
    loadLayout(fetch, locale),
  ]);
  const redirect = url.pathname.startsWith("/blog/")
    ? articleRedirect(inner, blog)
    : undefined;
  return {
    ...render(inner, blog, site.content, sections, layout, locale, extras),
    // A redirect is computed on the un-prefixed path, so it has to go back
    // into the language it came from or the reader changes language by
    // following a renamed link.
    redirect: redirect ? withLocale(redirect, locale) : undefined,
  };
}
