import { useState } from "react";
import { useSite } from "../context";
import { articleOutline, blogDate, blogPath } from "../lib/blog";
import { BlogCover, PostCard } from "../components/blog/BlogCard";
import { Icon } from "../components/Icon";
import { BlogEmpty } from "./Blog";

export function BlogArticle() {
  const { blog, href, locale, t } = useSite();
  const post = blog.article;
  const [share, setShare] = useState<"idle" | "copied" | "failed">("idle");
  if (blog.status === "unavailable")
    return (
      <section className="container blog-article-error">
        <BlogEmpty error />
      </section>
    );
  if (!post)
    return (
      <section className="container blog-empty">
        <span className="blog-eyebrow">ZUKATEK JOURNAL</span>
        <h1>{t("blog.article.missing_title")}</h1>
        <p>{t("blog.article.missing_body")}</p>
        <a className="button button-soft" href={href("/blog")}>
          {t("blog.article.back_cta")}
          <Icon name="arrow" />
        </a>
      </section>
    );
  const { body, headings, minutes } = articleOutline(post.body_html || "");
  const date = blogDate(post.published_at, locale);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        location.origin + href(blogPath(post.slug)),
      );
      setShare("copied");
    } catch {
      setShare("failed");
    }
  };
  return (
    <article className="blog-article">
      <div className="container">
        <nav className="blog-breadcrumb" aria-label={t("blog.a11y.breadcrumb")}>
          <a href={href("/")}>{t("blog.breadcrumb_home")}</a>
          <Icon name="chevron" />
          <a href={href("/blog")}>Blog</a>
          <Icon name="chevron" />
          <span aria-current="page">{t("blog.breadcrumb_article")}</span>
        </nav>
        <header className="blog-article-header">
          <a className="blog-eyebrow" href={href("/blog")}>
            ZUKATEK JOURNAL
          </a>
          <h1>{post.title}</h1>
          {post.excerpt && (
            <p className="blog-article-excerpt">{post.excerpt}</p>
          )}
          <div className="blog-article-meta">
            <span className="blog-brand-avatar">
              <img src="/assets/favicon.png" alt="" width="28" height="28" />
            </span>
            <span>Zukatek Journal</span>
            <span className="blog-meta-dot" />
            {date && <time dateTime={post.published_at!}>{date}</time>}
            <span className="blog-meta-dot" />
            <span>{t("blog.article.read_minutes", { n: minutes })}</span>
          </div>
        </header>
        <div className="blog-article-cover">
          <BlogCover post={post} priority />
        </div>
        <div className="blog-reading-layout">
          <aside className="blog-reading-sidebar">
            {headings.length > 1 && (
              <details className="blog-toc" open>
                <summary>{t("blog.article.toc_title")}</summary>
                <nav aria-label={t("blog.a11y.toc")}>
                  {headings.map((heading) => (
                    <a
                      className={
                        heading.level === 3 ? "blog-toc-sub" : undefined
                      }
                      href={`#${heading.id}`}
                      key={heading.id}
                    >
                      {heading.label}
                    </a>
                  ))}
                </nav>
              </details>
            )}
            <div className="blog-share">
              <span>{t("blog.article.share")}</span>
              <button onClick={copyLink}>
                <Icon name="arrow" />
                {share === "copied"
                  ? t("blog.article.copied")
                  : t("blog.article.copy_link")}
              </button>
              <p role="status">
                {share === "copied"
                  ? t("blog.article.copy_ok")
                  : share === "failed"
                    ? t("blog.article.copy_fail")
                    : ""}
              </p>
            </div>
          </aside>
          <div className="blog-reading-main">
            {body ? (
              <div
                className="blog-prose"
                dangerouslySetInnerHTML={{ __html: body }}
              />
            ) : (
              <p className="blog-prose">{t("blog.article.empty_body")}</p>
            )}
            <div className="blog-article-signoff">
              <span>BUILD SIMPLE. GROW BEYOND.</span>
              <p>{t("blog.article.signoff")}</p>
              <a href={href("/blog")}>{t("blog.article.back_link")}</a>
            </div>
          </div>
        </div>
        {blog.items.length > 0 && (
          <section
            className="blog-related"
            aria-labelledby="blog-related-title"
          >
            <div className="blog-section-heading">
              <div>
                <span className="blog-eyebrow">
                  {t("blog.article.related_eyebrow")}
                </span>
                <h2 id="blog-related-title">
                  {t("blog.article.related_title")}
                </h2>
              </div>
              <a className="text-link primary-text" href={href("/blog")}>
                {t("blog.article.related_all")}
                <Icon name="arrow" />
              </a>
            </div>
            <div className="blog-grid">
              {blog.items.slice(0, 3).map((item) => (
                <PostCard post={item} key={item.slug} />
              ))}
            </div>
          </section>
        )}
      </div>
    </article>
  );
}
