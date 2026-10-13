import { renderToString } from "react-dom/server";
import { App, resolveRoute } from "./App";
import type { AppProps, SiteContent } from "./types";
import { emptyBlog, type BlogState } from "./lib/blog";
import { loadBlog, articleRedirect } from "./lib/blog.server";
import { loadSiteContent } from "./lib/site.server";

export function render(
  path: string,
  blog: BlogState = emptyBlog(),
  data?: SiteContent,
) {
  const url = new URL(path, "http://site.local"),
    route = resolveRoute(url, data, blog);
  const props: AppProps = {
    url: url.pathname + url.search,
    year: new Date().getUTCFullYear(),
    blog,
    data,
  };
  const title = route.home
    ? "ZUKATEK — Đội ngũ phát triển & sản phẩm số"
    : route.blogList
      ? "Blog — Góc nhìn từ Zukatek"
      : route.blogDetail && blog.article
        ? blog.article.seo?.title || `${blog.article.title} — Zukatek Journal`
        : route.catalog
          ? "Sản phẩm — ZUKATEK"
          : route.product
            ? `${route.product.name} — ZUKATEK${route.product.example ? " · Minh họa" : ""}`
            : "Không tìm thấy — ZUKATEK";
  const description =
    (route.blogDetail
      ? blog.article?.seo?.description || blog.article?.excerpt
      : route.blogList
        ? "Kiến thức, kinh nghiệm và những câu chuyện trong hành trình xây dựng sản phẩm số của Zukatek."
        : undefined) ||
    route.product?.summary ||
    "ZUKATEK cung cấp sản phẩm số cho cá nhân, nhóm và doanh nghiệp. Xem đội ngũ, khám phá sản phẩm và liên hệ tư vấn trước khi mua.";
  return {
    html: renderToString(<App {...props} />),
    props,
    status: route.status,
    title,
    description,
    ogTitle: blog.article?.seo?.og_title || title,
    ogDescription: blog.article?.seo?.og_description || description,
    ogType: route.blogDetail && blog.article ? "article" : "website",
    canonical:
      blog.article?.seo?.canonical_url ||
      (route.blogList
        ? "/blog"
        : route.blogDetail && blog.article
          ? `/blog/${encodeURIComponent(blog.article.slug)}`
          : undefined),
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
  const url = new URL(path, "http://site.local");
  const needsBlog =
    url.pathname === "/" ||
    url.pathname === "/index.html" ||
    url.pathname === "/blog" ||
    url.pathname.startsWith("/blog/");
  // Content and blog are independent reads; fetch them together.
  const [blog, site] = await Promise.all([
    needsBlog ? loadBlog(path) : Promise.resolve(emptyBlog()),
    loadSiteContent(),
  ]);
  return {
    ...render(path, blog, site.content),
    redirect: url.pathname.startsWith("/blog/")
      ? articleRedirect(path, blog)
      : undefined,
  };
}
