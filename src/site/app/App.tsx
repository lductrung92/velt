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
import { emptyBlog, type BlogState } from "./lib/blog";

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
}: AppProps & { data?: SiteContent }) {
  const url = useMemo(() => new URL(path, "http://site.local"), [path]);
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
      href: (path: string) => withReferral(path, referrer),
    };
  }, [data, url, blog, sections]);
  const route = resolveRoute(url, data, blog);
  return (
    <SiteContext value={context}>
      <a className="skip-link" href="#main">
        Đến nội dung chính
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
                Hồ sơ ZUKATEK được giới thiệu bởi{" "}
                <strong>{context.referrer.name}</strong>
              </p>
              <a href={context.href("/#contact")}>
                Trao đổi cùng người giới thiệu ↗
              </a>
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
      <Footer href={context.href} year={year} />
      <Chat />
    </SiteContext>
  );
}
