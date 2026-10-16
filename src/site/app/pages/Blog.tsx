import { useEffect, useRef, useState } from "react";
import { useSite } from "../context";
import { PostCard } from "../components/blog/BlogCard";
import { Icon } from "../components/Icon";
import { Select } from "../components/Select";
import { PageHeroVisual } from "../components/hero/PageHeroVisual";
import { ListingViewToggle } from "../components/ListingViewToggle";
import { ListingFilterToggle } from "../components/ListingFilterToggle";
import { applyListingView, useListingView } from "../lib/listingView";

export function Blog() {
  const { blog, url, referrer, href, t } = useSite();
  const [view, changeView] = useListingView(url);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const closeFilters = () => {
    setFiltersOpen(false);
    document.getElementById("blog-extra-filters-toggle")?.focus();
  };
  const resetHref = href(view === "list" ? "/blog?view=list" : "/blog");
  // The sort box drives a GET form, so the chosen value has to live somewhere
  // the control can read back; the URL is what it ends up in either way.
  const [sort, setSort] = useState(blog.sort);
  const sortForm = useRef<HTMLFormElement>(null);
  // Submit only once the hidden input has been re-rendered with the new value.
  // Calling requestSubmit() straight from the change handler sends the value
  // the input still held, so picking "oldest" used to reload "newest".
  useEffect(() => {
    if (sort !== blog.sort) sortForm.current?.requestSubmit();
  }, [sort, blog.sort]);
  const filtered = !!blog.query || blog.sort !== "newest" || blog.page > 1;
  const pages = Math.ceil(blog.total / blog.pageSize);
  const pageHref = (page: number) => {
    const params = new URLSearchParams(url.search);
    params.set("page", String(page));
    applyListingView(params, view);
    return href(`/blog?${params}`);
  };
  const numbered = [
    ...new Set([1, blog.page - 1, blog.page, blog.page + 1, pages]),
  ]
    .filter((n) => n > 0 && n <= pages)
    .sort((a, b) => a - b);
  return (
    <div className="blog-page">
      <header className="blog-masthead page-hero page-hero--blog">
        <div className="container">
          <nav
            className="blog-breadcrumb"
            aria-label={t("blog.a11y.breadcrumb")}
          >
            <a href={href("/")}>{t("blog.breadcrumb_home")}</a>
            <Icon name="chevron" />
            <span aria-current="page">Blog</span>
          </nav>
          <div className="blog-masthead-copy page-hero-copy">
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
          <PageHeroVisual kind="blog" />
        </div>
      </header>
      <section
        className="blog-list-section container listing-blog"
        aria-labelledby="blog-list-title"
      >
        <form
          action={href("/blog")}
          method="get"
          className="listing-filters blog-listing-filters"
          data-expanded={filtersOpen}
          onKeyDown={(event) => {
            if (
              event.key === "Escape" &&
              filtersOpen &&
              !event.defaultPrevented
            ) {
              event.stopPropagation();
              closeFilters();
            }
          }}
          ref={sortForm}
        >
          {referrer && <input type="hidden" name="ref" value={referrer.id} />}
          {view === "list" && <input type="hidden" name="view" value="list" />}
          <div className="listing-field listing-query-field">
            <label htmlFor="blog-query">{t("blog.search_label")}</label>
            <div className="listing-search-control">
              <svg viewBox="0 0 24 24" className="icon" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 5 5" />
              </svg>
              <input
                type="search"
                id="blog-query"
                name="q"
                defaultValue={blog.query}
                placeholder={t("blog.search_placeholder")}
                maxLength={200}
              />
              <button
                className="listing-search-submit"
                type="submit"
                aria-label={t("blog.a11y.search_submit")}
              >
                <Icon name="arrow" />
              </button>
            </div>
          </div>
          <ListingFilterToggle
            controls="blog-extra-filters"
            expanded={filtersOpen}
            activeCount={Number(sort !== "newest")}
            onToggle={() => setFiltersOpen(!filtersOpen)}
          />
          <div className="listing-extra-filters" id="blog-extra-filters">
            <div className="listing-field">
              <label htmlFor="blog-sort">{t("blog.sort_label")}</label>
              <Select
                id="blog-sort"
                name="sort"
                value={sort}
                ariaLabel={t("blog.sort_label")}
                onChange={setSort}
                options={[
                  { value: "newest", label: t("blog.sort.newest") },
                  { value: "oldest", label: t("blog.sort.oldest") },
                  { value: "title", label: t("blog.sort.title") },
                ]}
              />
            </div>
            <div className="listing-filter-footer">
              {filtered && (
                <a className="listing-reset" href={resetHref}>
                  {t("blog.clear_filters")}
                </a>
              )}
              <button
                className="listing-filter-done"
                type="button"
                onClick={closeFilters}
              >
                {t("listing.filters_done")}
                <Icon name="check" />
              </button>
            </div>
          </div>
        </form>
        <div className="listing-results blog-listing-results">
          <h2 id="blog-list-title">
            {blog.query ? t("blog.search_results_title") : t("blog.list_title")}
            {blog.status === "ready" && <span>{blog.total}</span>}
          </h2>
          <div className="listing-results-actions">
            {filtered && (
              <a className="listing-reset" href={resetHref}>
                {t("blog.clear_filters")}
                <Icon name="close" />
              </a>
            )}
            <ListingViewToggle value={view} onChange={changeView} />
          </div>
        </div>
        {blog.status === "unavailable" ? (
          <BlogEmpty error />
        ) : blog.items.length === 0 ? (
          <BlogEmpty filtered={!!blog.query} resetHref={resetHref} />
        ) : (
          <>
            <div className="blog-grid" data-view={view}>
              {blog.items.map((post) => (
                <PostCard post={post} key={post.slug} listing />
              ))}
            </div>
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
  resetHref,
}: {
  error?: boolean;
  filtered?: boolean;
  resetHref?: string;
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
          href={
            error
              ? href(url.pathname + url.search)
              : (resetHref ?? href("/blog"))
          }
        >
          {error ? t("blog.empty.retry") : t("blog.empty.view_all")}
          <Icon name="arrow" />
        </a>
      )}
    </div>
  );
}
