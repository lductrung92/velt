import { useMemo } from "react";
import type { AppProps, SiteContent } from "./types";
import { content } from "./data/content";
import { getCatalog } from "./lib/catalog";
import { withReferral } from "./lib/links";
import { SiteContext } from "./context";
import { Header } from "./components/Header";
import { Icons, Footer } from "./components/HomeStatic";
import { Chat } from "./components/Chat";
import { Home } from "./pages/Home";
import { Catalog } from "./pages/Catalog";
import { ProductDetail, NotFound } from "./pages/ProductDetail";
import { Blog } from "./pages/Blog";
import { BlogArticle } from "./pages/BlogArticle";
import { blogPath, emptyBlog, type BlogState } from "./lib/blog";
import { defaultLayout } from "./lib/layout";
import { BASE_LOCALE, withLocale } from "./lib/locales";
import { translator } from "./lib/i18n";

export function resolveRoute(
  url: URL,
  data: SiteContent = content,
  blog: BlogState = emptyBlog(),
) {
  const { products } = getCatalog(data);
  const home = url.pathname === "/" || url.pathname === "/index.html";
  const catalog = ["/products", "/products/", "/products.html"].includes(
    url.pathname,
  );
  let id = url.pathname.startsWith("/products/")
    ? url.pathname.slice("/products/".length)
    : url.searchParams.get("id") || "";
  try {
    id = decodeURIComponent(id);
  } catch {
    id = "";
  }
  const detail =
    url.pathname === "/product.html" || url.pathname.startsWith("/products/");
  const product =
    detail && !catalog ? products.find((item) => item.id === id) : undefined;
  const blogList = /^\/blog\/?$/.test(url.pathname);
  const blogDetail = !blogList && url.pathname.startsWith("/blog/");
  return {
    home,
    catalog,
    product,
    blogList,
    blogDetail,
    status:
      blogList || blogDetail
        ? blog.status === "unavailable"
          ? 503
          : blogDetail && !blog.article
            ? 404
            : 200
        : home || catalog || product
          ? 200
          : 404,
  };
}
export function App({
  url: path,
  year,
  data = content,
  blog,
  sections,
  layout,
  locale = BASE_LOCALE,
  locales = [],
}: AppProps & { data?: SiteContent }) {
  const url = useMemo(() => new URL(path, "http://site.local"), [path]);
  // The site's own words, and the header/footer it falls back to, both follow
  // the language — so they are resolved once here and handed down.
  const t = useMemo(() => translator(locale), [locale]);
  const chrome = useMemo(() => layout ?? defaultLayout(t), [layout, t]);
  const context = useMemo(() => {
    const referrer = data.members.find(
      (member) => member.id === url.searchParams.get("ref"),
    );
    const { products, isExample } = getCatalog(data);
    return {
      data,
      url,
      referrer,
      products,
      isExample,
      blog: blog || emptyBlog(),
      sections,
      layout: chrome,
      locale,
      locales,
      t,
      // One place puts the language into an address, so every link on the page
      // stays in the language the reader is reading — including the ones built
      // from console data.
      href: (path: string) => withLocale(withReferral(path, referrer), locale),
      localeHref: (target: string) => {
        // An article has its own slug per language; anything else is the same
        // path under a different prefix.
        const alternate = blog?.article?.alternates?.find(
          (alt) => alt.locale === target,
        );
        const path = alternate
          ? blogPath(alternate.slug)
          : url.pathname + url.search;
        return withLocale(withReferral(path, referrer), target);
      },
    };
  }, [data, url, blog, sections, chrome, locale, locales, t]);
  const route = resolveRoute(url, data, blog);
  return (
    <SiteContext value={context}>
      <a className="skip-link" href="#main">
        {t("a11y.skip")}
      </a>
      <Icons />
      <Header />
      <main
        id="main"
        className={
          !route.home && !route.catalog && !route.blogList && !route.blogDetail
            ? "product-page"
            : undefined
        }
      >
        {context.referrer && (
          <div className="referral-banner">
            <div className="container">
              <span className="referral-avatar">
                {context.referrer.name.slice(0, 1)}
              </span>
              <p>
                {t("referral.intro")}{" "}
                <strong>{context.referrer.name}</strong>
              </p>
              <a href={context.href("/#contact")}>{t("referral.cta")}</a>
            </div>
          </div>
        )}
        {route.home ? (
          <Home />
        ) : route.catalog ? (
          <Catalog />
        ) : route.blogList ? (
          <Blog />
        ) : route.blogDetail ? (
          <BlogArticle />
        ) : route.product ? (
          <ProductDetail product={route.product} />
        ) : (
          <NotFound />
        )}
      </main>
      <Footer href={context.href} year={year} layout={chrome} />
      <Chat />
    </SiteContext>
  );
}
