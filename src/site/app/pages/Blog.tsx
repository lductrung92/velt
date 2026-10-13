import { useSite } from "../context";
import { PostCard } from "../components/blog/BlogCard";
import { Icon } from "../components/Icon";

export function Blog() {
  const { blog, url, referrer, href, t } = useSite();
  const filtered = !!blog.query || blog.sort !== "newest" || blog.page > 1;
  const featured = !filtered ? blog.items[0] : undefined;
  const items = featured ? blog.items.slice(1) : blog.items;
  const pages = Math.ceil(blog.total / blog.pageSize);
  const pageHref = (page: number) => {
    const params = new URLSearchParams(url.search);
    params.set("page", String(page));
    return href(`/blog?${params}`);
  };
  const numbered = [
    ...new Set([1, blog.page - 1, blog.page, blog.page + 1, pages]),
  ]
    .filter((n) => n > 0 && n <= pages)
    .sort((a, b) => a - b);
  return (
    <div className="blog-page">
      <header className="blog-masthead">
        <div className="container">
          <nav
            className="blog-breadcrumb"
            aria-label={t("blog.a11y.breadcrumb")}
          >
            <a href={href("/")}>{t("blog.breadcrumb_home")}</a>
            <Icon name="chevron" />
            <span aria-current="page">Blog</span>
          </nav>
          <div className="blog-masthead-copy">
            <span className="blog-eyebrow">ZUKATEK JOURNAL</span>
            <h1>
              {t("blog.masthead_title")}
              <span className="blog-title-dot">.</span>
            </h1>
            <p>
              {t("blog.masthead_lead_1")}
              <br className="blog-desktop-break" />
              {t("blog.masthead_lead_2")}
            </p>
          </div>
          <div className="blog-masthead-decoration" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      </header>
      <section
        className="blog-list-section container"
        aria-labelledby="blog-list-title"
      >
        <div className="blog-toolbar">
          <h2 id="blog-list-title">
            {blog.query ? t("blog.search_results_title") : t("blog.list_title")}
            {blog.status === "ready" && <span>{blog.total}</span>}
          </h2>
          <form action="/blog" method="get" className="blog-search">
            {referrer && <input type="hidden" name="ref" value={referrer.id} />}
            <label className="blog-visually-hidden" htmlFor="blog-query">
              {t("blog.search_label")}
            </label>
            <input
              type="search"
              id="blog-query"
              name="q"
              defaultValue={blog.query}
              placeholder={t("blog.search_placeholder")}
              maxLength={200}
            />
            <button type="submit" aria-label={t("blog.a11y.search_submit")}>
              <Icon name="arrow" />
            </button>
            <label className="blog-visually-hidden" htmlFor="blog-sort">
              {t("blog.sort_label")}
            </label>
            <select
              name="sort"
              id="blog-sort"
              defaultValue={blog.sort}
              aria-label={t("blog.sort_label")}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
            >
              <option value="newest">{t("blog.sort.newest")}</option>
              <option value="oldest">{t("blog.sort.oldest")}</option>
              <option value="title">{t("blog.sort.title")}</option>
            </select>
          </form>
        </div>
        {filtered && (
          <div className="blog-filter-summary">
            <span>
              {blog.query
                ? t("blog.results_for", { query: blog.query })
                : t("blog.all_articles_summary")}
            </span>
            <a href={href("/blog")}>{t("blog.clear_filters")}</a>
          </div>
        )}
        {blog.status === "unavailable" ? (
          <BlogEmpty error />
        ) : blog.items.length === 0 ? (
          <BlogEmpty filtered={!!blog.query} />
        ) : (
          <>
            {featured && <PostCard post={featured} featured />}
            {items.length > 0 && (
              <>
                <div className="blog-grid-heading">
                  <h2>
                    {featured ? t("blog.more_title") : t("blog.all_title")}
                  </h2>
                  <span>{t("blog.grid_subtitle")}</span>
                </div>
                <div className="blog-grid">
                  {items.map((post) => (
                    <PostCard post={post} key={post.slug} />
                  ))}
                </div>
              </>
            )}
            {pages > 1 && (
              <nav
                className="blog-pagination"
                aria-label={t("blog.a11y.pagination")}
              >
                {blog.page > 1 && (
                  <a
                    href={pageHref(blog.page - 1)}
                    aria-label={t("blog.a11y.prev_page")}
                  >
                    ←
                  </a>
                )}
                {numbered.map((page, index) => (
                  <span key={page}>
                    {index > 0 && page - numbered[index - 1] > 1 && (
                      <span className="blog-page-gap">…</span>
                    )}
                    <a
                      href={pageHref(page)}
                      aria-current={page === blog.page ? "page" : undefined}
                      aria-label={t("blog.a11y.page", { n: page })}
                    >
                      {page}
                    </a>
                  </span>
                ))}
                {blog.page < pages && (
                  <a
                    href={pageHref(blog.page + 1)}
                    aria-label={t("blog.a11y.next_page")}
                  >
                    →
                  </a>
                )}
              </nav>
            )}
          </>
        )}
      </section>
      <section className="container blog-endnote">
        <span>BUILD SIMPLE. GROW BEYOND.</span>
        <h2>{t("blog.endnote_title")}</h2>
        <p>{t("blog.endnote_body")}</p>
        <a className="text-link primary-text" href={href("/products")}>
          {t("blog.endnote_cta")}
          <Icon name="arrow" />
        </a>
      </section>
    </div>
  );
}

export function BlogEmpty({
  error = false,
  filtered = false,
}: {
  error?: boolean;
  filtered?: boolean;
}) {
  const { href, url, t } = useSite();
  return (
    <div className="blog-empty">
      <div className="blog-empty-icon">
        <Icon name="bulb" />
      </div>
      <h2>
        {error
          ? t("blog.empty.error_title")
          : filtered
            ? t("blog.empty.filtered_title")
            : t("blog.empty.title")}
      </h2>
      <p>
        {error
          ? t("blog.empty.error_body")
          : filtered
            ? t("blog.empty.filtered_body")
            : t("blog.empty.body")}
      </p>
      {(error || filtered) && (
        <a
          className="button button-soft"
          href={error ? href(url.pathname + url.search) : href("/blog")}
        >
          {error ? t("blog.empty.retry") : t("blog.empty.view_all")}
          <Icon name="arrow" />
        </a>
      )}
    </div>
  );
}
